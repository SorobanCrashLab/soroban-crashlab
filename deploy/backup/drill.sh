#!/usr/bin/env bash
# Local backup/restore drill (#1900). Needs Docker and Node ≥ 20.
#
#   deploy/backup/drill.sh            run the drill, print the drill record
#   KEEP_STACK=1 deploy/backup/drill.sh   leave the containers up afterwards
#
# Scenario: seed source KV + artifacts → backup → total loss of the source
# (KV flushed, bucket purged) → nightly verify (restore to scratch) → full
# restore into the source → check it matches → corrupt one backup object and
# prove verify catches it. Prints a JSON drill record for docs/ops/backup-restore.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DRILL="$HERE/drill"
PROJECT=crashlab-backup-drill
RCLONE_IMAGE='rclone/rclone:1.69.1@sha256:600f51856285df1ae5d91c8bb2682cbbe31bf109ebeeef9ecead6ca8c0ff6138'
WORK="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK"
  [[ "${KEEP_STACK:-0}" == 1 ]] || docker compose -p "$PROJECT" -f "$DRILL/compose.yml" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

log() { printf '[drill %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
ms() { node -e 'process.stdout.write(String(Date.now()))'; }

# rclone: use the host binary if present, else extract the pinned one.
if ! command -v rclone >/dev/null 2>&1 && [[ -z "${RCLONE:-}" ]]; then
  mkdir -p "$DRILL/.bin"
  if [[ ! -x "$DRILL/.bin/rclone" ]]; then
    log "extracting rclone from $RCLONE_IMAGE"
    cid="$(docker create "$RCLONE_IMAGE")"
    docker cp "$cid:/usr/local/bin/rclone" "$DRILL/.bin/rclone" >/dev/null
    docker rm "$cid" >/dev/null
  fi
  export RCLONE="$DRILL/.bin/rclone"
fi
RCLONE="${RCLONE:-rclone}"
export RCLONE_CONFIG=/notfound

set -a
# shellcheck source=drill/drill.env
source "$DRILL/drill.env"
set +a
export CRASHLAB_BACKUP_REPORT="$WORK/verify.json"

log "starting drill stack"
docker compose -p "$PROJECT" -f "$DRILL/compose.yml" up -d --quiet-pull >/dev/null
kv_cmd() { # kv_cmd <url> <token> <json command>
  curl -fs -X POST -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3" "$1"
}
ready=false
for _ in $(seq 1 90); do
  if kv_cmd "$CRASHLAB_BACKUP_SRC_KV_URL" "$CRASHLAB_BACKUP_SRC_KV_TOKEN" '["PING"]' >/dev/null 2>&1 &&
    kv_cmd "$CRASHLAB_BACKUP_SCRATCH_KV_URL" "$CRASHLAB_BACKUP_SCRATCH_KV_TOKEN" '["PING"]' >/dev/null 2>&1 &&
    curl -fs -o /dev/null "$CRASHLAB_BACKUP_SRC_S3_ENDPOINT/healthz" && curl -fs -o /dev/null "$CRASHLAB_BACKUP_DST_S3_ENDPOINT/healthz"; then
    ready=true
    break
  fi
  sleep 2
done
$ready || { log "drill stack did not become ready"; exit 1; }

# App-side credentials for seeding and for the full restore into the source.
export RCLONE_CONFIG_APP_TYPE=s3 RCLONE_CONFIG_APP_PROVIDER=Other RCLONE_CONFIG_APP_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_APP_ENDPOINT="$CRASHLAB_BACKUP_SRC_S3_ENDPOINT" RCLONE_CONFIG_APP_REGION=us-east-1
export RCLONE_CONFIG_APP_ACCESS_KEY_ID=drill-app RCLONE_CONFIG_APP_SECRET_ACCESS_KEY=drill-app-secret
APP_BUCKET="app:$CRASHLAB_BACKUP_SRC_S3_BUCKET"

log "seeding source KV and artifacts"
node "$DRILL/seed.mjs" >&2
mkdir -p "$WORK/seed/bundles" "$WORK/seed/corpus"
for i in $(seq 1 40); do head -c $((1024 * (i % 9 + 1))) /dev/urandom >"$WORK/seed/corpus/seed-$i.bin"; done
cp "$HERE/../../contracts/crashlab-core/fixtures/"*.json "$WORK/seed/bundles/"
"$RCLONE" mkdir "$APP_BUCKET"
"$RCLONE" copy "$WORK/seed" "$APP_BUCKET"
source_counts="$(node "$HERE/kv.mjs" count --target src)"
source_objects="$("$RCLONE" lsf -R --files-only "$APP_BUCKET" | wc -l | tr -d ' ')"

log "1/5 backup"
t0=$(ms)
"$HERE/backup.sh" >"$WORK/backup.json"
backup_ms=$(($(ms) - t0))

log "2/5 disaster: source KV flushed, artifact bucket purged"
kv_cmd "$CRASHLAB_BACKUP_SRC_KV_URL" "$CRASHLAB_BACKUP_SRC_KV_TOKEN" '["FLUSHDB"]' >/dev/null
"$RCLONE" purge "$APP_BUCKET"

log "3/5 nightly verify (restore to scratch)"
verify_ok=true
"$HERE/verify.sh" >/dev/null || verify_ok=false
cp "$WORK/verify.json" "$WORK/verify-clean.json"

log "4/5 full restore into the source"
t0=$(ms)
latest="$(source "$HERE/common.sh"; "$RCLONE" lsf --dirs-only vault:snapshots/ | sort | tail -n 1)"
(
  source "$HERE/common.sh"
  "$RCLONE" copy "vault:snapshots/${latest%/}" "$WORK/restore-snapshot"
  "$RCLONE" mkdir "$APP_BUCKET"
  "$RCLONE" copy vault:objects/current "$APP_BUCKET"
)
node "$HERE/kv.mjs" restore --in "$WORK/restore-snapshot/kv.ndjson.gz" --target src --flush >"$WORK/restore-kv.json"
restore_ms=$(($(ms) - t0))
restored_counts="$(node "$HERE/kv.mjs" count --target src)"
objects_match=true
"$RCLONE" checksum md5 "$WORK/restore-snapshot/objects.md5" "$APP_BUCKET" 2>/dev/null || objects_match=false

log "5/5 corrupt one backed-up object; verify must fail"
(
  source "$HERE/common.sh"
  # Overwrite one mirrored object's ciphertext in place (same name, junk bytes).
  current="$("$RCLONE" lsf -R --files-only vault:objects/current | awk 'NR == 1')"
  enc="$("$RCLONE" backend encode vault: "objects/current/$current")"
  head -c 2048 /dev/urandom | "$RCLONE" rcat "backup:$CRASHLAB_BACKUP_DST_S3_BUCKET/$enc"
)
tamper_detected=false
"$HERE/verify.sh" >/dev/null 2>&1 || tamper_detected=true

node -e '
  const fs = require("fs");
  const [dir, backupMs, restoreMs, verifyOk, sourceCounts, restoredCounts, sourceObjects, objectsMatch, tamperDetected] = process.argv.slice(1);
  const backup = JSON.parse(fs.readFileSync(`${dir}/backup.json`, "utf8"));
  const verify = JSON.parse(fs.readFileSync(`${dir}/verify-clean.json`, "utf8"));
  const src = JSON.parse(sourceCounts), restored = JSON.parse(restoredCounts);
  const record = {
    drill: "local reference stack (Redis+SRH, SeaweedFS S3, rclone crypt)",
    date: new Date().toISOString().slice(0, 10),
    source: { kvKeys: src.keys, objects: +sourceObjects },
    backup: { snapshot: backup.snapshot, durationSeconds: +(backupMs / 1000).toFixed(1) },
    nightlyVerify: { ok: verifyOk === "true", checks: verify.checks, restoreToScratchMinutes: verify.rto.actualMinutes },
    fullRestore: {
      durationSeconds: +(restoreMs / 1000).toFixed(1),
      kvCountsMatchSource: JSON.stringify(src) === JSON.stringify(restored),
      objectsMatchManifest: objectsMatch === "true",
    },
    // Must fail on the objects check specifically, not for an unrelated reason.
    tamperDetected: tamperDetected === "true" && JSON.parse(fs.readFileSync(`${dir}/verify.json`, "utf8")).checks?.objects === false,
  };
  record.passed = record.nightlyVerify.ok && record.fullRestore.kvCountsMatchSource && record.fullRestore.objectsMatchManifest && record.tamperDetected;
  console.log(JSON.stringify(record, null, 2));
  process.exit(record.passed ? 0 : 1);
' "$WORK" "$backup_ms" "$restore_ms" "$verify_ok" "$source_counts" "$restored_counts" "$source_objects" "$objects_match" "$tamper_detected"
