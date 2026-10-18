#!/bin/sh
# Backup + verification for the reference compose deployment (#1896).
# Runs inside the `backup` service (deploy/compose/compose.yml), which mounts
# its secrets as environment via load-secrets.sh.
#
# Each run writes one snapshot, encrypted client-side (rclone crypt keyed by
# BACKUP_ENCRYPTION_KEY) under $BACKUP_TARGET:
#   snapshots/<ts>/dump.rdb          point-in-time Redis dump (redis-cli --rdb)
#   snapshots/<ts>/app-data.tar.gz   the web app's data volume (artifacts, SQLite)
#   snapshots/<ts>/objects.md5       manifest of the S3 bucket at backup time
#   snapshots/<ts>/manifest.json     checksums and counts
#   objects/current/…                incremental mirror of the S3 bucket
#   objects/history/<ts>/…           objects changed or deleted by run <ts>
#
# Verification (the step that matters): the snapshot is read BACK from the
# backup target, decrypted, checksummed against the manifest, the RDB file is
# validated with redis-check-rdb, the artifact archive is listed, and the
# object mirror is compared with the live bucket (rclone cryptcheck).
# Any failure exits non-zero; /backups/last-success.json is only written on success.
set -eu

: "${REDIS_PASSWORD:?}" "${CRASHLAB_S3_ACCESS_KEY_ID:?}" "${CRASHLAB_S3_SECRET_ACCESS_KEY:?}" "${BACKUP_ENCRYPTION_KEY:?}"
BACKUP_TARGET="${BACKUP_TARGET:-/backups/vault}"
BUCKET="${CRASHLAB_S3_BUCKET:-crashlab-artifacts}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
REDIS_HOST="${REDIS_HOST:-redis}"
S3_ENDPOINT="${CRASHLAB_S3_ENDPOINT:-http://objects:8333}"
STATUS_FILE="${BACKUP_STATUS_FILE:-/backups/last-success.json}"

export RCLONE_CONFIG=/notfound
export RCLONE_CONFIG_OBJECTS_TYPE=s3 RCLONE_CONFIG_OBJECTS_PROVIDER=Other RCLONE_CONFIG_OBJECTS_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_OBJECTS_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_OBJECTS_REGION=us-east-1
export RCLONE_CONFIG_OBJECTS_ACCESS_KEY_ID="$CRASHLAB_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_OBJECTS_SECRET_ACCESS_KEY="$CRASHLAB_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE="$BACKUP_TARGET"
RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$BACKUP_ENCRYPTION_KEY")"
RCLONE_CONFIG_VAULT_PASSWORD2="$(rclone obscure "crashlab-backup-salt:$BACKUP_ENCRYPTION_KEY")"
export RCLONE_CONFIG_VAULT_PASSWORD RCLONE_CONFIG_VAULT_PASSWORD2
export REDISCLI_AUTH="$REDIS_PASSWORD"

log() { echo "[backup $(date -u +%H:%M:%S)] $*" >&2; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
started="$(date +%s)"
mkdir -p "$WORK/out" "$WORK/verify"
case "$BACKUP_TARGET" in /*) mkdir -p "$BACKUP_TARGET" ;; esac

log "snapshot $TS: Redis RDB"
dbsize="$(redis-cli -h "$REDIS_HOST" DBSIZE)"
redis-cli -h "$REDIS_HOST" --rdb "$WORK/out/dump.rdb" >/dev/null
redis-check-rdb "$WORK/out/dump.rdb" >"$WORK/rdb-check.log" 2>&1 || { cat "$WORK/rdb-check.log" >&2; exit 1; }

log "app data volume (artifacts + SQLite)"
tar -C /data/app -czf "$WORK/out/app-data.tar.gz" .
artifact_files="$(tar -tzf "$WORK/out/app-data.tar.gz" | grep -vc '/$' || true)"

log "object bucket manifest + incremental mirror"
rclone mkdir "objects:$BUCKET"
rclone md5sum "objects:$BUCKET" >"$WORK/out/objects.md5"
rclone sync "objects:$BUCKET" vault:objects/current --backup-dir "vault:objects/history/$TS"
objects="$(grep -c . "$WORK/out/objects.md5" || true)"

cat >"$WORK/out/manifest.json" <<EOF
{
  "snapshot": "$TS",
  "redis": { "dbsize": $dbsize, "sha256": "$(sha "$WORK/out/dump.rdb")" },
  "appData": { "files": $artifact_files, "sha256": "$(sha "$WORK/out/app-data.tar.gz")" },
  "objects": { "count": $objects, "sha256": "$(sha "$WORK/out/objects.md5")" }
}
EOF
rclone copy "$WORK/out" "vault:snapshots/$TS"

log "verify: read the snapshot back, decrypt, check"
rclone copy "vault:snapshots/$TS" "$WORK/verify"
for f in dump.rdb app-data.tar.gz objects.md5; do
  [ "$(sha "$WORK/verify/$f")" = "$(sha "$WORK/out/$f")" ] || { log "verify FAILED: $f checksum"; exit 1; }
done
redis-check-rdb "$WORK/verify/dump.rdb" >/dev/null 2>&1 || { log "verify FAILED: RDB invalid"; exit 1; }
tar -tzf "$WORK/verify/app-data.tar.gz" >/dev/null || { log "verify FAILED: app data archive"; exit 1; }
rclone cryptcheck "objects:$BUCKET" vault:objects/current 2>"$WORK/cryptcheck.log" || {
  cat "$WORK/cryptcheck.log" >&2
  log "verify FAILED: object mirror differs from the bucket"
  exit 1
}

log "retention: delete snapshots and history older than ${RETENTION_DAYS}d"
for area in snapshots objects/history; do
  rclone lsf "vault:$area" >/dev/null 2>&1 || continue
  rclone delete --min-age "${RETENTION_DAYS}d" "vault:$area"
  rclone rmdirs --leave-root "vault:$area" 2>/dev/null || true
done

finished="$(date +%s)"
summary="{\"snapshot\":\"$TS\",\"finishedAt\":$finished,\"durationSeconds\":$((finished - started)),\"redisKeys\":$dbsize,\"artifactFiles\":$artifact_files,\"objects\":$objects,\"verified\":true}"
printf '%s\n' "$summary" >"$STATUS_FILE"
log "snapshot $TS verified"
printf '%s\n' "$summary"
