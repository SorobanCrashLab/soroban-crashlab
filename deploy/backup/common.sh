# shellcheck shell=bash disable=SC2034  # variables here are consumed by the scripts that source this file
# Shared setup for backup.sh / verify.sh (#1900). Sourced, not executed.
#
# Remotes (rclone, configured from env only — nothing is written to disk):
#   src:    source artifact bucket, read-only credentials
#   backup: backup bucket, separate credentials and ideally a separate account
#   vault:  rclone crypt over backup:<bucket> — everything stored in the backup
#           bucket is encrypted client-side with CRASHLAB_BACKUP_ENCRYPTION_KEY

set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RCLONE="${RCLONE:-rclone}"
# Config comes from the environment only; never read or write an rclone.conf.
export RCLONE_CONFIG="${RCLONE_CONFIG:-/notfound}"
NODE="${NODE:-node}"

require() {
  local missing=()
  for name in "$@"; do [[ -n "${!name:-}" ]] || missing+=("$name"); done
  if ((${#missing[@]})); then
    echo "missing required env: ${missing[*]}" >&2
    exit 2
  fi
}

require \
  CRASHLAB_BACKUP_SRC_S3_ENDPOINT CRASHLAB_BACKUP_SRC_S3_BUCKET \
  CRASHLAB_BACKUP_SRC_S3_ACCESS_KEY_ID CRASHLAB_BACKUP_SRC_S3_SECRET_ACCESS_KEY \
  CRASHLAB_BACKUP_DST_S3_ENDPOINT CRASHLAB_BACKUP_DST_S3_BUCKET \
  CRASHLAB_BACKUP_DST_S3_ACCESS_KEY_ID CRASHLAB_BACKUP_DST_S3_SECRET_ACCESS_KEY \
  CRASHLAB_BACKUP_ENCRYPTION_KEY

if [[ "$CRASHLAB_BACKUP_SRC_S3_ACCESS_KEY_ID" == "$CRASHLAB_BACKUP_DST_S3_ACCESS_KEY_ID" ]]; then
  echo "backup bucket must use different credentials from the source (isolation)" >&2
  exit 2
fi

s3_remote() {
  local name="$1" prefix="$2"
  local endpoint="${prefix}_ENDPOINT" region="${prefix}_REGION" key="${prefix}_ACCESS_KEY_ID" secret="${prefix}_SECRET_ACCESS_KEY"
  export "RCLONE_CONFIG_${name}_TYPE=s3"
  export "RCLONE_CONFIG_${name}_PROVIDER=Other"
  export "RCLONE_CONFIG_${name}_ENDPOINT=${!endpoint}"
  export "RCLONE_CONFIG_${name}_REGION=${!region:-us-east-1}"
  export "RCLONE_CONFIG_${name}_ACCESS_KEY_ID=${!key}"
  export "RCLONE_CONFIG_${name}_SECRET_ACCESS_KEY=${!secret}"
  export "RCLONE_CONFIG_${name}_FORCE_PATH_STYLE=true"
}

s3_remote SRC CRASHLAB_BACKUP_SRC_S3
s3_remote BACKUP CRASHLAB_BACKUP_DST_S3
# The source credentials are read-only; never try to create its bucket.
export RCLONE_CONFIG_SRC_NO_CHECK_BUCKET=true

export RCLONE_CONFIG_VAULT_TYPE=crypt
export RCLONE_CONFIG_VAULT_REMOTE="backup:${CRASHLAB_BACKUP_DST_S3_BUCKET}"
RCLONE_CONFIG_VAULT_PASSWORD="$("$RCLONE" obscure "$CRASHLAB_BACKUP_ENCRYPTION_KEY")"
RCLONE_CONFIG_VAULT_PASSWORD2="$("$RCLONE" obscure "crashlab-backup-salt:${CRASHLAB_BACKUP_ENCRYPTION_KEY}")"
export RCLONE_CONFIG_VAULT_PASSWORD RCLONE_CONFIG_VAULT_PASSWORD2

SRC_BUCKET="src:${CRASHLAB_BACKUP_SRC_S3_BUCKET}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
now_ms() { "$NODE" -e 'process.stdout.write(String(Date.now()))'; }
