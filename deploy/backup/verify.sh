#!/usr/bin/env bash
# Automated restore verification (#1900): restore the newest snapshot into
# scratch and prove it is usable — not just that a file exists.
#
# Checks (any failure → exit 1, report says which):
#   rpo        newest snapshot is younger than CRASHLAB_BACKUP_RPO_HOURS (default 24)
#   kv         dump sha256 matches; restored key counts (by type and prefix) equal the manifest
#   objects    every restored artifact matches the md5 manifest taken at backup time
#   rto        restore finished within CRASHLAB_BACKUP_RTO_MINUTES (default 240)
#   hooks      CRASHLAB_BACKUP_ARTIFACT_VERIFY_CMD / CRASHLAB_BACKUP_CORPUS_VERIFY_CMD,
#              each run with the restored artifact directory as its last argument
# Reported, not failed: `sourceDrift` — live source key count vs the backup.
#
# CRASHLAB_BACKUP_SCRATCH_KV_* is FLUSHED on every run. Point it at a
# dedicated, disposable store only.
source "$(dirname "$0")/common.sh"
require CRASHLAB_BACKUP_SCRATCH_KV_URL CRASHLAB_BACKUP_SCRATCH_KV_TOKEN

src_kv="${CRASHLAB_BACKUP_SRC_KV_URL:-}"
if [[ "${CRASHLAB_BACKUP_SCRATCH_KV_URL%/}" == "${src_kv%/}" ]]; then
  echo "scratch KV must not be the source KV" >&2
  exit 2
fi

RPO_HOURS="${CRASHLAB_BACKUP_RPO_HOURS:-24}"
RTO_MINUTES="${CRASHLAB_BACKUP_RTO_MINUTES:-240}"
REPORT="${CRASHLAB_BACKUP_REPORT:-backup-verify-report.json}"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
declare -A RESULT

latest="$("$RCLONE" lsf --dirs-only vault:snapshots/ | sort | tail -n 1)"
latest="${latest%/}"
if [[ -z "$latest" ]]; then
  echo '{"ok":false,"error":"no snapshots found"}' | tee "$REPORT"
  exit 1
fi
log "verifying snapshot $latest"

age_hours="$("$NODE" -e '
  const n = process.argv[1].match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/).slice(1).map(Number);
  process.stdout.write(((Date.now() - Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])) / 3.6e6).toFixed(2));
' "$latest")"
RESULT[rpo]="$("$NODE" -e 'process.stdout.write(String(+process.argv[1] <= +process.argv[2]))' "$age_hours" "$RPO_HOURS")"

started=$(now_ms)
"$RCLONE" copy "vault:snapshots/$latest" "$WORK/snapshot" || log "snapshot download failed"

log "restoring KV into scratch"
if "$NODE" "$BACKUP_DIR/kv.mjs" restore --in "$WORK/snapshot/kv.ndjson.gz" --target scratch --flush >"$WORK/kv.json"; then
  RESULT[kv]=true
else
  RESULT[kv]=false
fi

log "restoring artifacts into scratch"
# A ciphertext that fails to decrypt makes the copy itself fail: that is a
# failed check to report, not a reason to stop before writing the report.
if "$RCLONE" copy vault:objects/current "$WORK/objects" 2>"$WORK/objects.log" &&
  "$RCLONE" checksum md5 "$WORK/snapshot/objects.md5" "$WORK/objects" 2>>"$WORK/objects.log"; then
  RESULT[objects]=true
else
  RESULT[objects]=false
  cat "$WORK/objects.log" >&2
fi
finished=$(now_ms)
restore_ms=$((finished - started))
RESULT[rto]="$("$NODE" -e 'process.stdout.write(String(+process.argv[1] <= +process.argv[2] * 60000))' "$restore_ms" "$RTO_MINUTES")"

RESULT[hooks]=true
for hook in CRASHLAB_BACKUP_ARTIFACT_VERIFY_CMD CRASHLAB_BACKUP_CORPUS_VERIFY_CMD; do
  if [[ -n "${!hook:-}" ]]; then
    log "running $hook"
    # shellcheck disable=SC2086 # the command is an operator-supplied command line
    ${!hook} "$WORK/objects" || RESULT[hooks]=false
  fi
done

source_counts='null'
if [[ -n "${CRASHLAB_BACKUP_SRC_KV_URL:-}" && -n "${CRASHLAB_BACKUP_SRC_KV_TOKEN:-}" ]]; then
  source_counts="$("$NODE" "$BACKUP_DIR/kv.mjs" count --target src || echo null)"
fi

"$NODE" -e '
  const fs = require("fs");
  const [snapshot, ageHours, restoreMs, rpoHours, rtoMinutes, kvFile, sourceCounts, report, ...checks] = process.argv.slice(1);
  const results = Object.fromEntries(checks.map((c) => c.split("=")).map(([k, v]) => [k, v === "true"]));
  const kv = fs.existsSync(kvFile) && fs.statSync(kvFile).size ? JSON.parse(fs.readFileSync(kvFile, "utf8")) : null;
  const source = JSON.parse(sourceCounts);
  const backupKeys = kv?.expected?.keys ?? null;
  const out = {
    ok: Object.values(results).every(Boolean),
    snapshot, checkedAt: new Date().toISOString(),
    checks: results,
    rpo: { targetHours: +rpoHours, actualHours: +ageHours },
    rto: { targetMinutes: +rtoMinutes, actualMinutes: +(restoreMs / 60000).toFixed(2) },
    kv: kv && { expected: kv.expected, restored: kv.restored },
    sourceDrift: source && backupKeys !== null
      ? { sourceKeys: source.keys, backupKeys, deltaPct: backupKeys ? +(((source.keys - backupKeys) / backupKeys) * 100).toFixed(2) : null }
      : null,
  };
  fs.writeFileSync(report, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
' "$latest" "$age_hours" "$restore_ms" "$RPO_HOURS" "$RTO_MINUTES" "$WORK/kv.json" "$source_counts" "$REPORT" \
  "rpo=${RESULT[rpo]}" "kv=${RESULT[kv]}" "objects=${RESULT[objects]}" "rto=${RESULT[rto]}" "hooks=${RESULT[hooks]}"
