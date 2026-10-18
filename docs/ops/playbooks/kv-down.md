# Playbook: KV / Redis down

Default severity **SEV2** (SEV1 if data loss is suspected). Exercised in the
[2026-10-16 game day](../game-days/2026-10-16-kv-down.md).

## Symptoms

- `/api/runs` and other KV-backed routes return **500** after a ~10 s wait
  (writes after up to ~27 s) — the KV client retries before failing.
- Web logs: `"message":"GET /api/runs failed" … "error":{"name":"UpstashError"}`
  or `UpstashJSONParseError`.
- `/api/health` and `/api/health/liveness` still report healthy — they do
  **not** check KV (game-day finding). Do not use them to rule KV out.
- Hosted (Upstash): status page incident or quota/rate-limit errors.

## Verify

```bash
# reference deployment
docker compose ps redis kv-rest
docker compose logs --since 10m web | grep -E 'Upstash|failed'
docker compose exec redis sh -c 'REDISCLI_AUTH="$(cat /run/secrets/REDIS_PASSWORD)" redis-cli ping'
# hosted
curl -s -H "Authorization: Bearer $KV_REST_API_TOKEN" -H 'Content-Type: application/json' \
  -d '["PING"]' "$KV_REST_API_URL"
```

Distinguish: Redis process down / out of memory (`docker compose logs redis`)
vs REST adapter down (`kv-rest`) vs credentials rotated without a restart
(401 from the REST call) vs hosted quota exhaustion.

## Mitigate

1. Post the incident update; note that run data is not being written.
2. Restart the failed piece: `docker compose start redis` (or `restart kv-rest`).
   Redis reloads `dump.rdb`; writes since the last RDB save (≤ ~1 min under
   load, ≤ 15 min idle) may be lost.
3. If Redis will not start or `dump.rdb` is corrupt: restore the latest
   verified snapshot (`docker compose --profile restore run --rm restore latest`,
   see [reference deployment](../../self-hosting/reference-deployment.md#restore)) — escalate to SEV1.
4. Credentials: if the REST token was rotated, recreate `web` and `kv-rest`
   together so both read the new secret.
5. Hosted: check quota; upgrade the plan or wait out the rate limit.

## Verify recovery

`GET /api/runs` → 200 in well under a second, a recently written run is
present, no new `UpstashError` lines for 10 minutes.

## Post-incident

- Compare the newest run ids with the last nightly to estimate lost writes.
- Take a fresh backup and confirm it verifies.
- Postmortem if SEV1/SEV2 lasted more than 30 minutes.
