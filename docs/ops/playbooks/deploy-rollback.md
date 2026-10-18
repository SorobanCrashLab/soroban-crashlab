# Playbook: deploy rollback

A deploy made things worse. Default severity follows impact (usually
**SEV2**). Roll back first, debug later.

## Symptoms

- Error rate, 5xx or failed health checks start right after a deploy.
- A core flow (runs list, run detail, artifact download, login) breaks.
- Boot fails: container restarting, migration errors in web logs.

## Verify

- Correlate: deploy time vs first error (Vercel deployment list, or
  `docker compose ps` / image digest on self-hosted).
- Is it the deploy? The previous version on the same data still works →
  roll back.

## Roll back

**Vercel:** Deployments → previous production deployment → *Promote to
Production* (or `vercel rollback`). Environment variable changes are not
rolled back by this — revert them separately.

**Self-hosted reference deployment** (W5-I10, #1896):

```bash
cd deploy/compose
# 1. previous image digest back in .env
sed -i 's|^CRASHLAB_WEB_IMAGE=.*|CRASHLAB_WEB_IMAGE=<previous digest>|' .env
# 2. if the new version ran migrations the old one cannot read, restore the
#    pre-upgrade snapshot (taken in step 2 of the upgrade runbook):
docker compose stop web kv-rest redis backup
docker compose --profile restore run --rm restore <pre-upgrade snapshot>
# 3. start and verify
docker compose up -d --wait
curl -fsS "https://$CRASHLAB_DOMAIN/api/health/liveness"
```

Migrations are forward-only; data written by the new version after the
pre-upgrade snapshot is lost on restore. Note the window in the incident.

## Verify recovery

Health green, the broken flow works, error rate back to baseline for 30 minutes.

## Post-incident

Postmortem (SEV1/SEV2). Ask: why did CI and the preview not catch it? Add
that check. Re-deploy the fix through the normal upgrade runbook.
