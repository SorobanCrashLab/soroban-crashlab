#!/usr/bin/env bash
# Boot + backup/restore drill for the reference deployment (#1896).
#
#   deploy/compose/drill.sh            boot, verify, back up, destroy, restore, verify
#   KEEP_STACK=1 deploy/compose/drill.sh
#
# Uses its own compose project (crashlab-drill), high ports (18080/18443),
# CRASHLAB_TLS_MODE=internal and secrets generated into ./secrets if absent.
# Output is the evidence pasted into the PR / drill table.
set -euo pipefail

cd "$(dirname "$0")"
export COMPOSE_PROJECT_NAME=crashlab-drill
DOMAIN=crashlab.localhost
ENV_FILE="$(mktemp)"
cat >"$ENV_FILE" <<EOF
CRASHLAB_DOMAIN=$DOMAIN
CRASHLAB_TLS_MODE=internal
CRASHLAB_HTTP_PORT=18080
CRASHLAB_HTTPS_PORT=18443
NEXT_PUBLIC_APP_URL=https://$DOMAIN:18443
CRASHLAB_S3_BUCKET=crashlab-artifacts
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=30
EOF
export CRASHLAB_ENV_FILE="$ENV_FILE"
dc() { docker compose --env-file "$ENV_FILE" "$@"; }
cleanup() {
  [[ "${KEEP_STACK:-0}" == 1 ]] || dc --profile restore down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

step() { printf '\n=== %s\n' "$*"; }
https() { curl -sS --cacert "$CA" --resolve "$DOMAIN:18443:127.0.0.1" "$@"; }

./generate-secrets.sh >/dev/null

step "build + boot"
dc build -q
dc up -d --wait --wait-timeout 300
dc ps --format 'table {{.Service}}\t{{.Status}}'

step "TLS edge"
CA="$(mktemp)"
dc cp caddy:/data/caddy/pki/authorities/local/root.crt "$CA" >/dev/null
https -o /dev/null -w 'GET https://%{url.host}:18443/api/health/liveness -> %{http_code} (TLS verified against Caddy local CA, %{ssl_verify_result}=0 ok)\n' \
  "https://$DOMAIN:18443/api/health/liveness"
curl -sS -o /dev/null -w 'GET http://%{url.host}:18080/ -> %{http_code} redirect to %{redirect_url}\n' \
  --resolve "$DOMAIN:18080:127.0.0.1" "http://$DOMAIN:18080/"
echo | openssl s_client -connect 127.0.0.1:18443 -servername "$DOMAIN" 2>/dev/null |
  openssl x509 -noout -subject -issuer -enddate
https -o /dev/null -w 'GET /api/health/metrics from the internet -> %{http_code} (blocked at the edge)\n' \
  "https://$DOMAIN:18443/api/health/metrics"
https -sI "https://$DOMAIN:18443/api/health/liveness" | grep -iE '^(strict-transport-security|x-content-type-options):'

step "health"
https "https://$DOMAIN:18443/api/health" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=JSON.parse(s).data;console.log("overall:",d.status);for(const[k,v]of Object.entries(d.dependencies))console.log(" ",k+":",v.status,v.message??"")})' 

step "hardening"
for svc in caddy web redis kv-rest objects backup; do
  cid="$(dc ps -q "$svc")"
  docker inspect "$cid" --format "$svc: user={{.Config.User}} readonly={{.HostConfig.ReadonlyRootfs}} capdrop={{.HostConfig.CapDrop}} capadd={{.HostConfig.CapAdd}} mem={{.HostConfig.Memory}} restart={{.HostConfig.RestartPolicy.Name}}"
done

step "seed data through the app and the bucket"
RUN_ID="drill-run-$(date +%s)"
https -o /dev/null -w "POST /api/runs -> %{http_code}\n" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$RUN_ID\",\"status\":\"failed\",\"area\":\"auth\",\"severity\":\"high\",\"duration\":1200,\"seedCount\":42,\"crashDetail\":null,\"cpuInstructions\":1,\"memoryBytes\":1,\"minResourceFee\":1}" \
  "https://$DOMAIN:18443/api/runs"
printf 'drill artifact %s\n' "$RUN_ID" >"$CA.artifact.txt"
https -o /dev/null -w "POST /api/artifacts -> %{http_code}\n" -F "file=@$CA.artifact.txt;filename=drill-artifact.txt" \
  "https://$DOMAIN:18443/api/artifacts"
dc exec -T backup sh -c '
  export RCLONE_CONFIG=/notfound RCLONE_CONFIG_O_TYPE=s3 RCLONE_CONFIG_O_PROVIDER=Other RCLONE_CONFIG_O_ENDPOINT=http://objects:8333 \
    RCLONE_CONFIG_O_ACCESS_KEY_ID="$(cat /run/secrets/CRASHLAB_S3_ACCESS_KEY_ID)" RCLONE_CONFIG_O_SECRET_ACCESS_KEY="$(cat /run/secrets/CRASHLAB_S3_SECRET_ACCESS_KEY)" \
    RCLONE_CONFIG_O_FORCE_PATH_STYLE=true
  rclone mkdir o:crashlab-artifacts && echo "bundle-for-'"$RUN_ID"'" | rclone rcat o:crashlab-artifacts/bundles/drill.json && rclone ls o:crashlab-artifacts'
found() { grep -c "$1" || true; }
before_runs="$(https "https://$DOMAIN:18443/api/runs?limit=100" | found "$RUN_ID")"
# With KV configured, GET /api/artifacts lists the KV index while uploads go to
# CRASHLAB_ARTIFACT_DIR (a known app gap, see the guide), so check the volume.
artifact_count() { dc exec -T web sh -c 'find /data/artifacts -type f | wc -l' | tr -d ' '; }
artifact_digest() { dc exec -T web sh -c 'cd /data/artifacts && find . -type f | sort | xargs sha256sum | sha256sum | cut -c1-16'; }
before_artifacts="$(artifact_count)"
before_digest="$(artifact_digest)"
echo "before: run matches=$before_runs artifact files=$before_artifacts artifact digest=$before_digest"

step "backup (with verification)"
t0=$(date +%s)
dc exec -T backup /opt/crashlab/load-secrets.sh /opt/backup/compose-backup.sh 2>&1 | tail -n 4
echo "backup took $(( $(date +%s) - t0 ))s"

step "disaster: stop the stack and delete the redis, app-data and object volumes"
dc down >/dev/null 2>&1
docker volume rm "${COMPOSE_PROJECT_NAME}_redis-data" "${COMPOSE_PROJECT_NAME}_app-data" "${COMPOSE_PROJECT_NAME}_objects-data" >/dev/null
docker volume ls --format '{{.Name}}' | grep "^${COMPOSE_PROJECT_NAME}_" | sed 's/^/remaining volume: /'

step "restore"
t0=$(date +%s)
dc up -d --wait init-volumes objects >/dev/null 2>&1 || dc up -d --wait objects >/dev/null
dc --profile restore run --rm restore latest 2>&1 | tail -n 3
dc up -d --wait --wait-timeout 300 >/dev/null
echo "restore + reboot took $(( $(date +%s) - t0 ))s"

step "verify restored data through the app"
after_runs="$(https "https://$DOMAIN:18443/api/runs?limit=100" | found "$RUN_ID")"
after_artifacts="$(artifact_count)"
after_digest="$(artifact_digest)"
after_object="$(dc exec -T backup sh -c '
  export RCLONE_CONFIG=/notfound RCLONE_CONFIG_O_TYPE=s3 RCLONE_CONFIG_O_PROVIDER=Other RCLONE_CONFIG_O_ENDPOINT=http://objects:8333 \
    RCLONE_CONFIG_O_ACCESS_KEY_ID="$(cat /run/secrets/CRASHLAB_S3_ACCESS_KEY_ID)" RCLONE_CONFIG_O_SECRET_ACCESS_KEY="$(cat /run/secrets/CRASHLAB_S3_SECRET_ACCESS_KEY)" \
    RCLONE_CONFIG_O_FORCE_PATH_STYLE=true
  rclone cat o:crashlab-artifacts/bundles/drill.json')"
echo "after:  run matches=$after_runs artifact files=$after_artifacts artifact digest=$after_digest object=${after_object:-MISSING}"
https -o /dev/null -w 'health after restore: /api/health/liveness -> %{http_code}\n' "https://$DOMAIN:18443/api/health/liveness"

rm -f "$CA" "$CA.artifact.txt"
if [[ "$after_runs" -gt 0 && "$after_artifacts" -gt 0 && "$after_digest" == "$before_digest" && "$after_object" == "bundle-for-$RUN_ID" ]]; then
  step "DRILL PASSED"
else
  step "DRILL FAILED"
  exit 1
fi
