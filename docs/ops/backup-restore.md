# Backup and restore

Reference implementation for #1900: what is backed up, how often, how long it
is kept, how it is restored, and the evidence that restore actually works.
Scripts live in [`deploy/backup/`](../../deploy/backup/).

> **Production status: not enabled.** The scripts, the nightly reference drill
> and the verify job exist; turning them on for a real deployment needs the
> maintainer infrastructure listed under
> [Production enablement](#production-enablement).

## Targets

| | Target | How it is measured |
|---|---|---|
| **RPO** (max data loss) | **24 h** | Nightly backup; `verify.sh` fails when the newest snapshot is older than `CRASHLAB_BACKUP_RPO_HOURS` (default 24). |
| **RTO** (max time to restore) | **4 h** | `verify.sh` times the restore-to-scratch and fails above `CRASHLAB_BACKUP_RTO_MINUTES` (default 240). Drill durations are recorded below. |

The 4 h RTO is dominated by artifact volume (download + decrypt); KV restores
in seconds at current sizes. Re-check the target when the artifact bucket
passes ~100 GB.

## What is backed up

| Data | Where it lives | Backup |
|---|---|---|
| KV — runs, role assignments, API token records, RBAC/role audit logs | Upstash Redis (`KV_REST_API_URL`) | `kv.mjs dump`: SCAN + per-type read (string/list/set/hash/zset) with TTLs, gzip NDJSON + manifest of counts by type and key prefix |
| Artifacts | MinIO / S3 (`CRASHLAB_S3_BUCKET`) | `rclone sync` to `objects/current`; anything changed or deleted by a run is moved to `objects/history/<snapshot>` instead of being lost |

Every snapshot also stores `objects.md5` (the source artifact manifest at
backup time) and `backup.json` (run summary).

### Encryption and isolation

- Everything in the backup bucket is encrypted client-side by an rclone
  `crypt` remote (file contents and names) keyed by
  `CRASHLAB_BACKUP_ENCRYPTION_KEY`. Use the deployment's backup key material
  (W5-C01); losing it makes every backup unreadable, so escrow it separately
  from the backup bucket.
- The backup bucket uses **separate credentials** from the source — the
  scripts refuse to run when the access key ids match. Use a separate account
  or project where the provider allows it, so a compromised app credential
  cannot delete backups.
- The source is read with read-only credentials (S3 read/list, Upstash
  read-only token).
- Where the backend supports it (`rclone backend versioning`), bucket
  versioning is enabled too; for MinIO also add a lifecycle rule expiring
  noncurrent versions after 90 days (`mc ilm rule add --noncurrent-expire-days 90`).

### Retention tiers

Applied by `backup.sh` after each run to `snapshots/` and `objects/history/`
([`retention.mjs`](../../deploy/backup/retention.mjs), unit-tested):

| Age | Kept |
|---|---|
| < 7 days | every snapshot |
| 7–30 days | newest per ISO week |
| 30–90 days | newest per month |
| ≥ 90 days | none |

## Automated verification

[`verify.sh`](../../deploy/backup/verify.sh) restores the newest snapshot into
**scratch** (a dedicated, disposable KV + a temp directory) and fails unless:

- `rpo` — the snapshot is younger than the RPO;
- `kv` — the dump's sha256 matches its manifest and the restored key counts,
  by type and by key prefix, equal the counts recorded at backup time;
- `objects` — every restored artifact matches the md5 manifest (a ciphertext
  that no longer decrypts fails here);
- `rto` — the restore finished within the RTO;
- `hooks` — `CRASHLAB_BACKUP_ARTIFACT_VERIFY_CMD` and
  `CRASHLAB_BACKUP_CORPUS_VERIFY_CMD` exit 0 when set. They receive the
  restored artifact directory as their last argument; wire the W5-E11
  artifact verify and W5-B10 corpus verify commands here once they land.

It also reports, without failing, `sourceDrift`: live source key count vs the
backup — a large negative drift means the *source* lost data.

[`.github/workflows/backup-verify.yml`](../../.github/workflows/backup-verify.yml)
runs nightly (04:30 UTC), **report-only**: it is not a required check. Jobs:

- `reference-drill` — the full drill below against a throwaway stack;
- `production-verify` — `verify.sh` against real backups, off until enabled;
- `health-issue` — on a scheduled failure, opens or comments on
  *“Health: nightly backup verification failed”* (`ci-failure` label).

### When nightly verification fails

1. Open the run and download `backup-verify-report` / `backup-drill-record`.
2. Read `checks`: `rpo` → the backup job did not run or failed (check the
   scheduler); `kv` → compare `expected` and `restored`, then re-run
   `backup.sh` and verify again; `objects` → the backup bucket holds a corrupt
   or tampered object — treat as a security incident until explained, and do
   **not** let retention prune older snapshots (pause the backup job).
3. Record the incident in the drill table below.

## Restore runbook

Prerequisites: Node ≥ 20, `rclone` (or Docker to extract the pinned one, as
`drill.sh` does), the `CRASHLAB_BACKUP_*` variables, the encryption key.

1. **Freeze writes.** Put the app in maintenance (scale to zero / disable the
   Vercel deployment) so nothing writes while restoring.
2. **Choose the snapshot.**
   ```bash
   source deploy/backup/common.sh
   rclone lsf --dirs-only vault:snapshots/      # newest last
   rclone cat vault:snapshots/<ts>/backup.json
   ```
3. **Download it.**
   ```bash
   rclone copy vault:snapshots/<ts> ./restore
   ```
4. **Restore KV** into the target store. Point `CRASHLAB_BACKUP_SRC_KV_URL`
   / `_TOKEN` at the store to restore *into* (a read-write token), then:
   ```bash
   node deploy/backup/kv.mjs restore --in ./restore/kv.ndjson.gz --target src --flush
   ```
   The command checks the sha256 and prints restored vs expected counts; it
   exits non-zero on a mismatch.
5. **Restore artifacts** with credentials that can write the target bucket:
   ```bash
   rclone copy vault:objects/current <target-remote>:<bucket>
   rclone checksum md5 ./restore/objects.md5 <target-remote>:<bucket>
   ```
   To recover an object as it was before a later run changed or deleted it,
   copy it from `vault:objects/history/<later-ts>/`.
6. **Smoke test**: `/api/health` and `/api/health/liveness`, open a few runs and artifacts, sign in.
7. **Unfreeze**, then run `backup.sh` immediately so the next RPO window starts
   from the restored state. Record the restore in the drill table.

## Chaos scenario: full region loss

The source region (KV + artifact bucket + app) is gone; the backup bucket
lives in another region/account.

1. Provision a new KV (Upstash, new region) and bucket in a surviving region.
2. Create read-write credentials for both; keep the backup credentials
   read-only for the restore.
3. Run the restore runbook above with the new stores as targets.
4. Point the deployment env (`KV_REST_API_URL`, `KV_REST_API_TOKEN`,
   `CRASHLAB_S3_*`) at the new stores; redeploy.
5. Re-point `backup.sh` sources at the new stores; run a backup and a verify.

The drill exercises steps 3–5 in miniature: the source KV is flushed and the
bucket purged ("region gone"), then everything is rebuilt from the backup
bucket alone.

## Local drill

```bash
deploy/backup/drill.sh        # Docker + Node; ~45 s; prints a JSON drill record
```

Stack ([`deploy/backup/drill/compose.yml`](../../deploy/backup/drill/compose.yml)):
Redis behind serverless-redis-http (Upstash REST protocol) for source and
scratch KV, two SeaweedFS S3 servers for the source artifacts and the isolated
backup bucket (MinIO no longer publishes public images; the scripts only speak
S3). Steps: seed → backup → disaster (flush KV, purge bucket) → nightly verify
→ full restore into the source → corrupt one backed-up object and require
`verify.sh` to fail on the `objects` check.

## Drill record

| Date | Where | Data | Backup | Restore (actual vs 4 h target) | Result | Issues found |
|---|---|---|---|---|---|---|
| 2026-10-16 | Local reference stack | 494 KV keys (string/set/list/hash/zset, incl. a TTL key), 44 artifacts | 2.9 s | Full restore 2.7 s; verify restore-to-scratch 0.02 min | ✅ all checks passed; KV counts by type/prefix equal the source; artifacts match manifest; tampered object detected | Drill found that a ciphertext which no longer decrypts made `verify.sh` exit before writing its report; fixed so it is reported as a failed `objects` check. |

Add a row for every drill and every real restore. A production drill
(restoring real backups into scratch, timed end to end) is still owed once
production backups are enabled.

## Production enablement

Maintainer actions — not done by this change:

1. Create the backup bucket in a separate account/region with its own
   credentials; enable versioning and the 90-day noncurrent-version rule.
2. Create an Upstash read-only token for the source and a dedicated scratch
   database for verification.
3. Generate and escrow `CRASHLAB_BACKUP_ENCRYPTION_KEY`.
4. Schedule `deploy/backup/backup.sh` nightly (00:30 UTC) on infrastructure
   that holds those credentials.
5. Add the `CRASHLAB_BACKUP_*` repository secrets used by `production-verify`
   and set the repository variable `CRASHLAB_BACKUP_PROD_ENABLED=true`.
6. Run and record a production drill.

| Variable | Purpose |
|---|---|
| `CRASHLAB_BACKUP_SRC_KV_URL` / `_TOKEN` | Source KV (read-only token for backups) |
| `CRASHLAB_BACKUP_SCRATCH_KV_URL` / `_TOKEN` | Disposable KV that `verify.sh` **flushes** every run |
| `CRASHLAB_BACKUP_SRC_S3_{ENDPOINT,REGION,BUCKET,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Source artifact bucket, read-only |
| `CRASHLAB_BACKUP_DST_S3_{ENDPOINT,REGION,BUCKET,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Backup bucket, separate credentials |
| `CRASHLAB_BACKUP_ENCRYPTION_KEY` | Client-side encryption key |
| `CRASHLAB_BACKUP_RPO_HOURS` / `CRASHLAB_BACKUP_RTO_MINUTES` | Verify thresholds (24 / 240) |
| `CRASHLAB_BACKUP_ARTIFACT_VERIFY_CMD` / `CRASHLAB_BACKUP_CORPUS_VERIFY_CMD` | Optional integrity hooks run on the restored artifacts |
| `CRASHLAB_BACKUP_REPORT` | Path of the JSON verify report |
