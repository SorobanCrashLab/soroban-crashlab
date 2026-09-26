# Environment Variables Reference

Contract for operators and CI. Every variable is classified:

| Classification | Meaning |
|---|---|
| **public** | Safe in the browser bundle (`NEXT_PUBLIC_*`) |
| **server-only** | Read only on the server / Rust process; never prefix with `NEXT_PUBLIC_` |
| **secret** | Credential or bearer token — placeholders only in examples; configure in Vercel/CI secrets |

Copy `apps/web/.env.example` → `apps/web/.env.local` for Next.js.
Copy `.env.docker.example` → `.env` for Docker Compose.
Drift is enforced by `node scripts/audit-env.mjs` (wired into `ops-scripts-syntax` in CI).

---

## Master table (classification)

| Variable | Classification | Owner / purpose | Default |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | public | Browser + routes: upstream API base; empty = same-origin `/api` | empty |
| `NEXT_PUBLIC_APP_URL` | public | Canonical app URL for links / server fetches | `http://localhost:3000` |
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | public | Serve mock run data when backend unset | `true` |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | public | GitHub OAuth app client id | empty |
| `NEXT_PUBLIC_GITHUB_REPOSITORY` | public | Default `owner/repo` for Actions UI | empty |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Sentry DSN (safe in client) | empty |
| `NEXT_PUBLIC_VERCEL_ENV` | public | Platform-provided Vercel env label | platform |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | public | Optional analytics id | empty |
| `DISCORD_WEBHOOK_URL` | secret | Discord webhook notifications | empty |
| `SLACK_BOT_TOKEN` | secret | Slack `chat:write` bot token | empty |
| `SLACK_CHANNEL_ID` | server-only | Slack channel for run threads | empty |
| `SLACK_SIGNING_SECRET` | secret | Slack interactivity request verification | empty |
| `CRASHLAB_WEBHOOK_API_KEY` | secret | Bearer for `/api/webhooks` | empty |
| `CRASHLAB_CRON_SECRET` | secret | Bearer for `/api/schedules/tick` | empty |
| `CRASHLAB_METRICS_SCRAPE_TOKEN` | secret | Bearer for metrics/health scrape routes | empty |
| `CRASHLAB_API_TOKEN_TTL_DAYS` | server-only | Default API token lifetime (days) | `90` |
| `CRASHLAB_API_TOKEN_ROTATION_GRACE_HOURS` | server-only | Rotated token grace window | `24` |
| `CRASHLAB_API_RATE_LIMIT_WINDOW_MS` | server-only | Rate-limit window | `60000` |
| `CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS` | server-only | Max requests per window | `120` |
| `CRASHLAB_ARTIFACT_DIR` | server-only | Local FS artifact adapter directory | OS temp + `crashlab-artifacts` |
| `CRASHLAB_STORAGE_DRIVER` | server-only | `s3` to enable object storage; else in-memory | empty |
| `CRASHLAB_S3_ENDPOINT` | server-only | S3/MinIO endpoint | empty |
| `CRASHLAB_S3_REGION` | server-only | S3 region | empty |
| `CRASHLAB_S3_BUCKET` | server-only | S3 bucket | empty |
| `CRASHLAB_S3_ACCESS_KEY_ID` | secret | S3 access key | empty |
| `CRASHLAB_S3_SECRET_ACCESS_KEY` | secret | S3 secret key | empty |
| `CRASHLAB_S3_SESSION_TOKEN` | secret | Optional S3 session token | empty |
| `JIRA_BASE_URL` | server-only | Jira site URL | empty |
| `JIRA_EMAIL` | server-only | Jira user email | empty |
| `JIRA_API_TOKEN` | secret | Jira API token | empty |
| `JIRA_PROJECT_KEY` | server-only | Default Jira project key | empty |
| `LINEAR_API_KEY` | secret | Linear API key | empty |
| `GITHUB_ACTIONS_TOKEN` | secret | Fine-grained Actions token | empty |
| `GRAFANA_BASE_URL` | server-only | Grafana base URL | empty |
| `GRAFANA_API_TOKEN` | secret | Grafana API token | empty |
| `PAGERDUTY_INTEGRATION_KEY` | secret | PagerDuty Events API key | empty |
| `DATADOG_ENABLED` | server-only | Enable Datadog metrics export | `false` |
| `DATADOG_AGENT_HOST` | server-only | DogStatsD host | `localhost` |
| `DATADOG_AGENT_PORT` | server-only | DogStatsD port | `8125` |
| `MAX_REQUEST_SIZE` | server-only | Max request body (bytes) | `10485760` |
| `MAX_JSON_SIZE` | server-only | Max JSON body (bytes) | `5242880` |
| `MAX_FORM_DATA_SIZE` | server-only | Max multipart body (bytes) | `104857600` |
| `DATABASE_TYPE` | server-only | `sqlite` \| `postgres` \| `vercel-postgres` | `sqlite` |
| `SQLITE_PATH` | server-only | SQLite file path | `.data/crashlab.db` |
| `DATABASE_URL` | secret | Postgres connection URL | empty |
| `POSTGRES_URL_NON_POOLING` | secret | Vercel Postgres non-pooling URL | empty |
| `DB_POOL_MAX` | server-only | Pool max connections | `10` |
| `RUNS_API_URL` | server-only | Upstream runs API override | empty |
| `ISSUES_API_URL` | server-only | Upstream issues API override | falls back to `NEXT_PUBLIC_API_URL` |
| `NOTIFICATIONS_FEED_ENABLED` | server-only | Toggle notifications feed | `true` |
| `NOTIFICATIONS_FEED_URL` | server-only | Notifications feed URL | empty |
| `NOTIFICATIONS_API_URL` | server-only | Legacy notifications URL | empty |
| `NOTIFICATION_RETENTION_DAYS` | server-only | Notification retention | `90` |
| `WEBHOOK_HISTORY_RETENTION_DAYS` | server-only | Webhook delivery history TTL | `30` |
| `PROMETHEUS_ENDPOINT` | server-only | Prometheus base URL | `http://localhost:9090` |
| `PROMETHEUS_HEALTH_PATH` | server-only | Prometheus health path | `/-/healthy` |
| `PROMETHEUS_TIMEOUT_MS` | server-only | Probe timeout | `5000` |
| `SERVICE_NAME` | server-only | Structured logger service name | `soroban-crashlab` |
| `CLOUDWATCH_ENABLED` | server-only | Ship logs to CloudWatch | `false` |
| `CLOUDWATCH_LOG_GROUP` | server-only | CloudWatch log group | `/soroban/crashlab` |
| `CLOUDWATCH_LOG_STREAM` | server-only | CloudWatch log stream | `default` |
| `AWS_REGION` | server-only | AWS region for CloudWatch | `us-east-1` |
| `KV_REST_API_URL` | secret | Upstash Redis REST URL | empty |
| `KV_REST_API_TOKEN` | secret | Upstash Redis REST token | empty |
| `UPLOADTHING_SECRET` | secret | Uploadthing API secret (SDK) | empty |
| `SENTRY_AUTH_TOKEN` | secret | Sentry release/source-map upload | empty |
| `SENTRY_ORG` | server-only | Sentry org slug | empty |
| `SENTRY_PROJECT` | server-only | Sentry project slug | empty |
| `SENTRY_RELEASE` | server-only | Optional release override | git SHA |
| `CRASHLAB_RUNNER` | server-only | Rust runner: `mock` \| `host` \| `rpc` | `mock` |
| `CRASHLAB_CONTRACT_WASM` | server-only | Path to contract `.wasm` for host runner | empty |
| `CRASHLAB_RPC_URL` | server-only | Soroban RPC URL for rpc runner | empty |
| `CRASHLAB_CONTRACT_ID` | server-only | Contract id for rpc runner | empty |
| `CRASHLAB_STATE_DIR` | server-only | Rust run-state directory | `.crashlab` |
| `CRASHLAB_OUTPUT_FORMAT` | server-only | Set `json` for machine-readable CLI | empty |
| `CRASHLAB_PRESET` | server-only | `smoke` \| `nightly` \| `deep` | `nightly` |

---

## Web application notes

Variables prefixed with `NEXT_PUBLIC_` are bundled into the browser build. Do not put secrets in them.

Mock vs backend mode: see [`ARCHITECTURE.md`](ARCHITECTURE.md). Deploy paths: see [`DEPLOYMENT.md`](DEPLOYMENT.md).

### Sentry build & release

`SENTRY_AUTH_TOKEN` is a privileged secret. Configure it only in Vercel Project Settings and GitHub Actions secrets — never commit real values.

---

## Local configuration examples

### Minimal local dashboard (mock data)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_MOCK_DATA=true
```

### Local dashboard with backend and artifacts

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
CRASHLAB_ARTIFACT_DIR=/var/tmp/crashlab-artifacts
```

### Production frontend with rate limiting

```bash
NEXT_PUBLIC_APP_URL=https://your-crashlab.example.com
NEXT_PUBLIC_API_URL=https://api.your-crashlab.example.com
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS=120
CRASHLAB_API_RATE_LIMIT_WINDOW_MS=60000
```

---

## Sentry preview verification recipe

1. Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel (Preview + Production).
2. Ensure GitHub Actions secrets for Vercel + Sentry are present for `vercel-preview.yml`.
3. Open a PR, confirm source maps upload in build logs, trigger a test error on the preview URL, and verify symbolication in Sentry.

---

## Auditing drift

```bash
node scripts/audit-env.mjs
```

Fails CI when code readsites and the three documentation surfaces disagree.
