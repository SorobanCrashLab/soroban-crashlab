#!/usr/bin/env bash
# Nightly backup (#1900): KV dump + incremental artifact mirror, encrypted,
# into an isolated bucket, then retention pruning.
#
# Layout inside the (encrypted) backup bucket:
#   snapshots/<YYYYMMDDTHHMMSSZ>/kv.ndjson.gz(.manifest.json)  KV point-in-time dump
#   snapshots/<ts>/objects.md5                                   source artifact manifest
#   snapshots/<ts>/backup.json                                   run summary
#   objects/current/...                                          artifact mirror
#   objects/history/<ts>/...                                     objects changed/deleted by run <ts>
#
# Env: see common.sh, plus CRASHLAB_BACKUP_SRC_KV_URL / _TOKEN (read-only token is enough).
source "$(dirname "$0")/common.sh"
require CRASHLAB_BACKUP_SRC_KV_URL CRASHLAB_BACKUP_SRC_KV_TOKEN

TS="${CRASHLAB_BACKUP_SNAPSHOT:-$(date -u +%Y%m%dT%H%M%SZ)}"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
started=$(now_ms)

log "snapshot $TS: dumping KV"
"$NODE" "$BACKUP_DIR/kv.mjs" dump --out "$WORK/kv.ndjson.gz" >/dev/null

log "recording source artifact manifest"
"$RCLONE" md5sum "$SRC_BUCKET" >"$WORK/objects.md5"

log "mirroring artifacts (incremental; changed/deleted objects kept under objects/history/$TS)"
"$RCLONE" mkdir "backup:${CRASHLAB_BACKUP_DST_S3_BUCKET}"
# Best effort: keep provider-side versions too where the backend supports it.
"$RCLONE" backend versioning "backup:${CRASHLAB_BACKUP_DST_S3_BUCKET}" Enabled >/dev/null 2>&1 ||
  log "bucket versioning not supported by this backend; relying on objects/history"
"$RCLONE" sync "$SRC_BUCKET" vault:objects/current --backup-dir "vault:objects/history/$TS"

finished=$(now_ms)
"$NODE" -e '
  const fs = require("fs");
  const [ts, started, finished, dir] = process.argv.slice(1);
  const kv = JSON.parse(fs.readFileSync(`${dir}/kv.ndjson.gz.manifest.json`, "utf8"));
  const objects = fs.readFileSync(`${dir}/objects.md5`, "utf8").split("\n").filter(Boolean).length;
  fs.writeFileSync(`${dir}/backup.json`, JSON.stringify({
    snapshot: ts, startedAt: new Date(+started).toISOString(), durationMs: finished - started,
    kv: { keys: kv.keys, byType: kv.byType, sha256: kv.sha256 }, objects,
  }, null, 2) + "\n");
' "$TS" "$started" "$finished" "$WORK"

"$RCLONE" copy "$WORK" "vault:snapshots/$TS"
log "snapshot $TS written"

log "applying retention (7d daily / 30d weekly / 90d monthly)"
for area in snapshots objects/history; do
  "$RCLONE" lsf --dirs-only "vault:$area/" 2>/dev/null | "$NODE" "$BACKUP_DIR/retention.mjs" | while read -r expired; do
    [[ -n "$expired" ]] || continue
    log "pruning $area/$expired"
    "$RCLONE" purge "vault:$area/${expired%/}"
  done
done

cat "$WORK/backup.json"
