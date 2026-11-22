# Playbook: suspected credential compromise

Always **SEV1**. Use a private channel and a private security advisory —
never a public issue. Assume the attacker can read anything the credential
could read.

## Symptoms

- A secret appears in a commit, log, issue, paste or artifact.
- API calls from an unknown token id or unusual source in the RBAC audit log
  (`GET /api/settings/roles/audit`); unexpected role grants.
- Webhook deliveries or integration actions nobody triggered.
- Provider alerts (GitHub secret scanning, Upstash, S3 access logs).

## Verify (quickly — containment does not wait for certainty)

1. Identify **which** credential: API token, `CRASHLAB_WEBHOOK_API_KEY`,
   session secret, webhook signing secret, KV token, S3 keys, RPC key,
   `GITHUB_TOKEN`/deploy keys, backup key.
2. Check the audit logs for the window it was exposed: role changes, token
   creations, deletions, config imports.

## Contain

| Credential | Action |
|---|---|
| Scoped API token | Revoke in Settings → Tokens (token lifecycle W5-C02, #1804) |
| `CRASHLAB_WEBHOOK_API_KEY`, `CRASHLAB_GITHUB_SESSION_SECRET`, `CRASHLAB_CRON_SECRET`, `CRASHLAB_METRICS_SCRAPE_TOKEN` | Replace the secret file / env, recreate `web`. Rotating the session secret logs everyone out — intended. |
| Webhook signing secret | Rotate in Settings → Webhooks; update the receiver |
| `KV_REST_API_TOKEN`, Redis password, S3 keys | Rotate at the provider / regenerate the secret file, recreate dependent services |
| `BACKUP_ENCRYPTION_KEY` | New key for future backups; old backups remain readable to the attacker — treat their contents as exposed |
| GitHub tokens / deploy keys | Revoke in GitHub settings; review recent workflow runs and pushes |

Then **quarantine**: disable affected integrations, pause scheduled
campaigns that use the credential, and preserve logs before rotation
overwrites anything.

## Assess

- What could the credential reach? List data and actions; check them in the
  audit log for the exposure window.
- Results integrity: were runs, artifacts or fixtures written or deleted?
  Compare against the last verified backup manifest.
- Persistence: new tokens, role grants, webhooks or deploy keys created by the
  attacker — remove them.

## Recover

Restore tampered data from the newest backup before the exposure; re-run the
nightly; confirm no further use of the old credential.

## Post-incident

Postmortem within 5 business days. If users were affected, publish an
advisory per `.github/SECURITY.md`. Add the leak path to secret scanning
or redaction (W5-C10, #1812).
