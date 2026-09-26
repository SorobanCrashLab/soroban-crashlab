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
| `CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS` | secret | Escape hatch for unauthenticated webhooks | empty |
| `CRASHLAB_CRON_SECRET` | secret | Bearer for `/api/schedules/tick` | empty |
| `CRASHLAB_METRICS_SCRAPE_TOKEN` | secret | Bearer for metrics/health scrape routes | empty |
| `CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS` | secret | Escape hatch for unauthenticated metrics | empty |
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

<<<<<<< HEAD
=======
### Security Boundary & Secrets
- **OAuth Callback**: Redirection from GitHub is handled by the server-side callback route `/api/auth/github/callback` (`apps/web/src/app/api/auth/github/callback/route.ts`).
- **OAuth Secret**: The corresponding client secret must remain strictly server-side (never prefixed with `NEXT_PUBLIC_`) and is not exposed to client-side code.

### `CRASHLAB_WEBHOOK_API_KEY`
- **Required**: No
- **Default**: empty (authentication enforced by default — endpoints return 503 when unset)
- **Used by**: Webhook API routes (`apps/web/src/app/api/webhooks/route.ts`, `/api/webhooks/retry`, `/api/webhooks/recovery`)
- **Description**: When set, all `GET`, `POST`, `PATCH`, and `DELETE` requests to `/api/webhooks` and related endpoints must include an `Authorization: Bearer <key>` header that matches this value exactly. The comparison is performed using a timing-safe algorithm to prevent side-channel attacks. Requests with a missing or incorrect token are rejected with HTTP 401. When this variable is absent or empty, the endpoints return HTTP 503 with a clear operator-facing message. To explicitly allow unauthenticated access for local development only, set `CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS=1` (NOT recommended for production or preview deployments).

### `CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS`
- **Required**: No
- **Default**: empty (authentication enforced)
- **Used by**: Webhook API routes (`apps/web/src/app/api/webhooks/route.ts`, `/api/webhooks/retry`, `/api/webhooks/recovery`)
- **Description**: Escape hatch for local development only. When set to `1` or `true`, webhook endpoints allow unauthenticated requests even when `CRASHLAB_WEBHOOK_API_KEY` is not configured. **WARNING**: Do not enable in production or preview deployments — this exposes mutating endpoints to the internet.

### `CRASHLAB_API_TOKEN_TTL_DAYS`
- **Required**: No
- **Default**: `90`
- **Used by**: API token store (`apps/web/src/lib/storage/api-token-store.ts`)
- **Description**: Default lifetime in days applied to scoped API tokens created via `/api/settings/tokens` when no explicit `expiresAt` is supplied. Tokens are stored as SHA-256 hashes only (plaintext secrets are shown once at creation and never persisted).

### `CRASHLAB_API_TOKEN_ROTATION_GRACE_HOURS`
- **Required**: No
- **Default**: `24`
- **Used by**: API token store (`apps/web/src/lib/storage/api-token-store.ts`)
- **Description**: Overlap window in hours during which a rotated token's previous secret remains valid. After the grace window elapses, resolve calls treat the old secret as revoked.

### Role-Based Access Control

RBAC roles are resolved from a persisted role store keyed by an authenticated
principal, never from the request. See
[THREAT_MODEL_ARTIFACT_HANDLING.md](./THREAT_MODEL_ARTIFACT_HANDLING.md) (T-11).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRASHLAB_GITHUB_SESSION_SECRET` | No | *(unset)* | HMAC signing secret for the `crashlab_github_session` cookie issued by the GitHub OAuth callback. When set, a browser session resolves to a `github:<login>` principal whose role comes from the role store. When unset, no session is issued or trusted and browser callers resolve to the anonymous principal, which carries the lowest role. **Do not set this while the OAuth code exchange is still stubbed** — the session then names the stub identity, so anyone who completes the flow is that user. |
| `CRASHLAB_GITHUB_SESSION_TTL_SECONDS` | No | `604800` | Lifetime of the GitHub session cookie, in seconds (7 days). |
| `CRASHLAB_RBAC_AUDIT_RETENTION_DAYS` | No | `90` | Age-based retention for the RBAC authorization audit log. Entries older than this are filtered out on read. |
| `CRASHLAB_RBAC_AUDIT_MAX_ENTRIES` | No | `10000` | Hard cap on retained RBAC audit entries. The oldest are dropped once the cap is reached. |
| `CRASHLAB_RBAC_ROLE_AUDIT_MAX_ENTRIES` | No | `1000` | Hard cap on retained role-assignment change entries. |

**Durability**: role assignments and both audit logs are written through the
record driver layer (`apps/web/src/lib/storage/record-driver.ts`). When
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are set, that is Upstash Redis and the
writes survive the invocation. When they are not, the in-memory driver is used,
which is a single-instance store — adequate for local development, and not a
durable audit trail for a multi-instance deployment.

**Identity sources**:
- `Authorization: Bearer <secret>` matching `CRASHLAB_WEBHOOK_API_KEY` — principal `api-key:env:CRASHLAB_WEBHOOK_API_KEY`
- `Authorization: Bearer <secret>` matching a token issued by `/api/settings/tokens` — principal `api-key:<token id>`
- The signed `crashlab_github_session` cookie — principal `github:<login>`

A caller that presents no usable credential is the `anonymous` principal and
resolves to the lowest role. A role asserted in a header, query parameter,
cookie or request body is ignored everywhere, in every environment.

---

## 4. Web Application Variables

Variables prefixed with `NEXT_PUBLIC_` are bundled into the browser build. Do not put secrets, private tokens, or internal-only URLs in these values.

| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | empty | Web app, API routes | Base URL for the CrashLab backend. Leave empty to use mock data locally. Set this to the deployed backend URL when mock data is disabled. |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Web app | Canonical web URL used for server-side fetches, report links, and run detail permalinks. Set this explicitly in production. |
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | No | `true` | API routes | Enables mock run data when no backend is configured. Set to `false` in production once `NEXT_PUBLIC_API_URL` points at a real backend. |
| `NEXT_PUBLIC_VERCEL_ENV` | No | platform-provided | Settings UI | Vercel-provided deployment environment label. Local development can omit it. |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | No | empty | Hosting analytics | Optional public analytics identifier. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | empty | Web app, Sentry SDK (`apps/web/src/lib/integrations/sentry-client.ts`) | Sentry Data Source Name (DSN) for client and server-side runtime error tracking. When omitted, Sentry client initialization is skipped and error reporting falls back to console logging. Safe to expose publicly in client bundles. |

---

## 5. Server-Only Variables

These values are read only by Next.js server routes, middleware, or build tools. Keep them out of client-side code and do not prefix them with `NEXT_PUBLIC_`.

### Sentry Build & Release Configuration (CI & Hosting Pipeline)

These variables configure source map generation, uploading, release tagging, and git commit association during production and preview builds (`next build` / `vercel build`) via `withSentryConfig` in `apps/web/next.config.ts`.

> [!WARNING]
> **Security Requirement**: `SENTRY_AUTH_TOKEN` is a privileged secret. **Never commit real tokens to the repository or expose them with `NEXT_PUBLIC_` prefixes.** Configure it exclusively in Vercel Project Settings (`Settings > Environment Variables`, scoped to Production and Preview) and GitHub Actions secrets (`secrets.SENTRY_AUTH_TOKEN`).

| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `SENTRY_AUTH_TOKEN` | Yes (for map uploads) | *(unset)* | `@sentry/nextjs` via `withSentryConfig` in `next.config.ts` | Sentry authentication token with permissions: `project:releases` (read/write) and `org:read`. Required by the Sentry Webpack plugin at build time to upload hidden source maps and associate releases with git commits. |
| `SENTRY_ORG` | Yes (for map uploads) | *(unset)* | `@sentry/nextjs` via `withSentryConfig` in `next.config.ts` | Sentry organization slug (e.g. `soroban-crashlab`). Must match your Sentry organization identifier. |
| `SENTRY_PROJECT` | Yes (for map uploads) | *(unset)* | `@sentry/nextjs` via `withSentryConfig` in `next.config.ts` | Sentry project slug (e.g. `soroban-crashlab-web`). Must match your Sentry project identifier. |
| `SENTRY_RELEASE` | No | Auto-detected git commit SHA | `@sentry/nextjs` via `withSentryConfig` in `next.config.ts` | Explicit release identifier override. If not set, `withSentryConfig` in `apps/web/next.config.ts` automatically defaults to the git commit SHA via `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or local git (`git rev-parse HEAD`). |

### API & Issue Configuration
| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `RUNS_API_URL` | No | empty | Run API routes | Optional backend URL for run detail and replay requests. |
| `ISSUES_API_URL` | No | `NEXT_PUBLIC_API_URL` | Issue-link routes | Backend URL for issue-link creation and verification. |

### API Rate Limiting (`apps/web/src/proxy.ts`)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRASHLAB_API_RATE_LIMIT_WINDOW_MS` | No | `60000` | Rolling rate-limit window in milliseconds for proxy API requests. |
| `CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS` | No | `120` | Maximum API requests allowed per client key within the rate-limit window. |

### Prometheus Health & Monitoring (`apps/web/src/app/api/health/metrics/route.ts`)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROMETHEUS_ENDPOINT` | No | `http://localhost:9090` | Prometheus base URL for health metrics querying. |
| `PROMETHEUS_HEALTH_PATH` | No | `/-/healthy` | Health path queried on the Prometheus endpoint. |
| `PROMETHEUS_TIMEOUT_MS` | No | `5000` | Timeout in milliseconds for health queries. |
| `CRASHLAB_METRICS_SCRAPE_TOKEN` | No | *(unset)* | Shared secret that must be presented as `Authorization: Bearer <token>` on `/api/health/metrics` and `/api/integrations/prometheus/health`. When unset, both probes remain open for backward compatibility; when set, missing/mismatched tokens are rejected with `401`. |

### Notifications Feed Configuration (`apps/web/src/app/api/notifications/route.ts`)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTIFICATIONS_FEED_ENABLED` | No | `true` | Set to `false`, `0`, `off`, or `no` to disable fetching the notifications feed. |
| `NOTIFICATIONS_FEED_URL` | No | empty | URL for the optional notifications feed (takes preference over `NOTIFICATIONS_API_URL`). |
| `NOTIFICATIONS_API_URL` | No | empty | Legacy fallback URL for the notifications feed. |

---

## 6. Fuzzer CLI Configuration (Rust Crate)

These variables configure the fuzzer execution when running via the Rust CLI tools (`contracts/crashlab-core`).

### `CRASHLAB_STATE_DIR`
- **Required**: No
- **Default**: `.crashlab`
- **Description**: Base directory for storing run execution state, logs, and cancellation markers.

### `CRASHLAB_OUTPUT_FORMAT`
- **Required**: No
- **Default**: empty (CLI table format)
- **Description**: Set to `json` to output fuzzer results as JSON (used by the Rust ↔ Next.js data bridge).

### `CRASHLAB_PRESET`
- **Required**: No
- **Default**: `nightly`
- **Values**:
  - `smoke`: Low-intensity exploration suitable for brief checks.
  - `nightly`: Balanced default for standard scheduled runs.
  - `deep`: High-intensity mutation suite for thorough verification.

---

## Local Configuration Examples

### Minimal Local Dashboard (Mock Data)
>>>>>>> 33467fbc9a8b66202665560ab86499eda0484523
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
