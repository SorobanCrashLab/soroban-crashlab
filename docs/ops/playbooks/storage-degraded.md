# Playbook: storage degraded or corrupt

Default severity **SEV3** for a degraded backend; **SEV1** the moment data
looks corrupt, missing or altered.

## Symptoms

- Auto-issue `CI failure: storage-driver-minio nightly` (S3 contract suite failed).
- `/api/health` dependency `database` `degraded`/`unavailable`.
- Artifact downloads 404/500, checksum or "unexpected end of JSON" errors,
  bundles that no longer parse, replay failures on previously good fixtures.
- Storage integrity sweep findings once W5-E11 (#1843) lands.

## Verify

1. Scope it: one artifact, one run, or everything? Note the earliest bad timestamp.
2. Backend reachable? `docker compose ps objects` / provider status page;
   `rclone lsd` against the bucket with the app's credentials.
3. Integrity: compare suspect objects with the latest verified backup manifest
   (`objects.md5` in the snapshot) — a mismatch on an object that should be
   immutable is corruption or tampering.
4. Disk: `df -h` on the host / volume; full disks corrupt writes.
5. Fixtures: `cargo run --bin check-fixtures -- <bundle.json>` on suspect bundles.

## Mitigate

- **Degraded backend:** reduce write load (pause scheduled campaigns), fix
  capacity/connectivity, re-run the failing contract suite.
- **Corruption/loss (SEV1):**
  1. Stop writers (`docker compose stop web backup`) so retention cannot prune
     the good snapshots and new writes do not mix with bad data.
  2. Preserve evidence: copy the damaged volume/bucket aside before touching it.
  3. Restore from the newest snapshot whose verification passed *before* the
     earliest bad timestamp (reference deployment: restore profile).
  4. If tampering is possible, also run the
     [credential compromise](credential-compromise.md) playbook.

## Verify recovery

Contract suite green; spot-checked artifacts download and match the manifest;
replay of a known fixture reproduces; a new backup verifies.

## Post-incident

Postmortem (SEV1/SEV2). Record lost data window; add a regression test or
integrity check for the failure mode.
