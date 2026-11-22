#!/bin/sh
# Restore for the reference compose deployment (#1896). Runs in the
# `restore` service (profile `restore`), which mounts the Redis data and
# app-data volumes read-write. Usage, from deploy/compose:
#
#   docker compose stop web kv-rest redis backup
#   docker compose --profile restore run --rm restore [<snapshot>|latest]
#   docker compose up -d
#
# Steps: pick the snapshot, download + decrypt, check every file against the
# snapshot manifest and validate the RDB, then replace dump.rdb (Redis must be
# stopped — it loads the file on start), replace the app data volume, and
# sync the object bucket back from the mirror. Nothing is overwritten until
# all checks pass.
set -eu

: "${CRASHLAB_S3_ACCESS_KEY_ID:?}" "${CRASHLAB_S3_SECRET_ACCESS_KEY:?}" "${BACKUP_ENCRYPTION_KEY:?}"
BACKUP_TARGET="${BACKUP_TARGET:-/backups/vault}"
BUCKET="${CRASHLAB_S3_BUCKET:-crashlab-artifacts}"
S3_ENDPOINT="${CRASHLAB_S3_ENDPOINT:-http://objects:8333}"
REDIS_DATA="${REDIS_DATA:-/restore/redis}"
APP_DATA="${APP_DATA_DIR:-/restore/app}"

export RCLONE_CONFIG=/notfound
export RCLONE_CONFIG_OBJECTS_TYPE=s3 RCLONE_CONFIG_OBJECTS_PROVIDER=Other RCLONE_CONFIG_OBJECTS_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_OBJECTS_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_OBJECTS_REGION=us-east-1
export RCLONE_CONFIG_OBJECTS_ACCESS_KEY_ID="$CRASHLAB_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_OBJECTS_SECRET_ACCESS_KEY="$CRASHLAB_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE="$BACKUP_TARGET"
RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$BACKUP_ENCRYPTION_KEY")"
RCLONE_CONFIG_VAULT_PASSWORD2="$(rclone obscure "crashlab-backup-salt:$BACKUP_ENCRYPTION_KEY")"
export RCLONE_CONFIG_VAULT_PASSWORD RCLONE_CONFIG_VAULT_PASSWORD2

log() { echo "[restore $(date -u +%H:%M:%S)] $*" >&2; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
manifest_sha() { sed -n "/\"$1\"/s/.*\"sha256\": \"\([0-9a-f]*\)\".*/\1/p" "$WORK/snap/manifest.json"; }

snapshot="${1:-latest}"
if [ "$snapshot" = latest ]; then
  snapshot="$(rclone lsf --dirs-only vault:snapshots/ | sort | tail -n 1)"
  snapshot="${snapshot%/}"
fi
[ -n "$snapshot" ] || { log "no snapshots found under $BACKUP_TARGET"; exit 1; }
log "restoring snapshot $snapshot"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
rclone copy "vault:snapshots/$snapshot" "$WORK/snap"

[ "$(sha "$WORK/snap/dump.rdb")" = "$(manifest_sha redis)" ] || { log "dump.rdb checksum mismatch"; exit 1; }
[ "$(sha "$WORK/snap/app-data.tar.gz")" = "$(manifest_sha appData)" ] || { log "app data checksum mismatch"; exit 1; }
redis-check-rdb "$WORK/snap/dump.rdb" >/dev/null 2>&1 || { log "dump.rdb fails redis-check-rdb"; exit 1; }
tar -tzf "$WORK/snap/app-data.tar.gz" >/dev/null
log "snapshot verified; writing"

cp "$WORK/snap/dump.rdb" "$REDIS_DATA/dump.rdb.restoring"
chown 999:1000 "$REDIS_DATA/dump.rdb.restoring"
mv "$REDIS_DATA/dump.rdb.restoring" "$REDIS_DATA/dump.rdb"

find "$APP_DATA" -mindepth 1 -delete
tar -C "$APP_DATA" -xzf "$WORK/snap/app-data.tar.gz"
chown -R 1001:1001 "$APP_DATA"

rclone mkdir "objects:$BUCKET"
rclone sync vault:objects/current "objects:$BUCKET"
rclone checksum md5 "$WORK/snap/objects.md5" "objects:$BUCKET"

log "restored $snapshot: $(cat "$WORK/snap/manifest.json" | tr -d '\n ')"
