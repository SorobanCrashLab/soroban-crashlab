#!/usr/bin/env sh
# Creates deploy/compose/secrets/ with one random value per file (#1896).
# Existing files are kept, so re-running never rotates a live secret by
# accident. The directory is 0700: other host users cannot read it. Files are
# 0644 inside it so the containers' non-root users can read their bind mount.
set -eu
cd "$(dirname "$0")"
umask 077
mkdir -p secrets
chmod 700 secrets

gen() { # gen NAME BYTES [alnum]
  f="secrets/$1"
  [ -s "$f" ] && { echo "keep   $f"; return; }
  if [ "${3:-}" = alnum ]; then
    openssl rand -hex "$2" | tr -d '\n' >"$f"
  else
    openssl rand -base64 "$2" | tr -d '\n' >"$f"
  fi
  chmod 644 "$f"
  echo "create $f"
}

gen REDIS_PASSWORD 32 alnum
gen KV_REST_API_TOKEN 32 alnum
gen CRASHLAB_S3_ACCESS_KEY_ID 10 alnum
gen CRASHLAB_S3_SECRET_ACCESS_KEY 30 alnum
gen CRASHLAB_METRICS_SCRAPE_TOKEN 32 alnum
gen CRASHLAB_GITHUB_SESSION_SECRET 32
gen CRASHLAB_WEBHOOK_API_KEY 32 alnum
gen CRASHLAB_CRON_SECRET 32 alnum
# Master key for envelope encryption of stored secrets (W5-C01). Back it up
# OUTSIDE this host: losing it makes encrypted data unrecoverable.
gen SECRETS_MASTER_KEY 32
# Client-side encryption key for backups. Store a copy offline too.
gen BACKUP_ENCRYPTION_KEY 32
