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
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | public | Sentry environment name | Vercel env, else `NODE_ENV` |
| `NEXT_PUBLIC_SENTRY_RELEASE` | public | Release name, set by `next.config.ts` at build | `soroban-crashlab-web@<version>+<sha>` |
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
| `PAGERDUTY_WEBHOOK_SECRET` | secret | Signing secret of the PagerDuty v3 webhook subscription; ack/resolve in PagerDuty is reflected in the dashboard (`/api/integrations/pagerduty/webhook`) | empty (webhook returns 503) |
| `ALERT_POLICY_PATH` | server-only | Alert routing policy file (see `docs/ops/oncall.md`) | `ops/alert-policies.yml` |
| `ALERT_SLACK_WEBHOOK_URL` | secret | Slack incoming webhook for routed alerts | empty (slack channel skipped) |
| `ALERT_EMAIL_TO` | server-only | Recipient(s) for email-routed alerts; uses the stored SMTP config | empty (email channel skipped) |
| `OIDC_ISSUER` | server-only | Pinned OIDC issuer; discovery must report exactly this `issuer` (ADR 0009) | empty (OIDC disabled) |
| `OIDC_CLIENT_ID` | server-only | OIDC client id; must appear in `aud` (and `azp` for multi-aud tokens) | empty |
| `OIDC_CLIENT_SECRET` | secret | OIDC confidential client secret | empty |
| `OIDC_REDIRECT_URI` | server-only | Exact callback URL registered with the IdP (`…/api/auth/oidc/callback`) | empty |
| `OIDC_SCOPES` | server-only | Requested scopes | `openid email profile` |
| `OIDC_CLOCK_SKEW_SECONDS` | server-only | Allowed clock skew for `exp`/`iat`/`nbf` (0–300) | `60` |
| `OIDC_ROLE_MAPPING` | server-only | JSON claim→role mapping, e.g. `{"claim":"groups","rules":[{"value":"crashlab-maintainers","role":"maintainer"}]}`; no default role (ADR 0009) | empty (OIDC disabled) |
| `CRASHLAB_OIDC_SESSION_SECRET` | secret | HMAC secret for the `crashlab_oidc_session` cookie | empty (no OIDC sessions) |
| `CRASHLAB_TENANCY_MEMBERSHIPS` | server-only | JSON array of org/project memberships (ADR 0010); unset = single-tenant default org | empty |
| `CRASHLAB_AUDIT_CHECKPOINT_KEY` | secret | HMAC key signing audit-chain checkpoints; keep it out of the audit store | empty (no checkpoints) |
| `DATADOG_ENABLED` | server-only | Enable Datadog metrics export | `false` |
| `DATADOG_AGENT_HOST` | server-only | DogStatsD host | `localhost` |
| `DATADOG_AGENT_PORT` | server-only | DogStatsD port | `8125` |
| `MAX_REQUEST_SIZE` | server-only | Max request body (bytes) | `10485760` |
| `MAX_JSON_SIZE` | server-only | Max JSON body (bytes) | `1048576` |
| `MAX_FORM_DATA_SIZE` | server-only | Default max multipart body (bytes); artifact upload routes have an explicit larger cap | `1048576` |
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
| `SENTRY_RELEASE` | server-only | Optional release override | `soroban-crashlab-web@<version>+<sha>` |
| `SENTRY_UPLOAD_SOURCEMAPS` | server-only | Upload hidden source maps + create the release | `false` |
| `SENTRY_TUNNEL_ROUTE` | server-only | Same-origin Sentry tunnel path | empty |
| `CRASHLAB_CI_REPOSITORY` | server-only | `owner/repo` allowed to post CI regression results | empty (any) |
| `CRASHLAB_QUOTA_CONCURRENT_WORKERS` | server-only | Campaign worker quota (global scope) | empty (unlimited) |
| `CRASHLAB_QUOTA_SEEDS_PER_DAY` | server-only | Campaign seeds/day quota | empty (unlimited) |
| `CRASHLAB_QUOTA_RPC_CALLS_PER_DAY` | server-only | Campaign RPC calls/day quota | empty (unlimited) |
| `CRASHLAB_QUOTA_STORAGE_GB` | server-only | Artifact storage quota (GB) | empty (unlimited) |
| `CRASHLAB_SCHEDULING_WINDOWS` | server-only | UTC windows per campaign class | empty (always open) |
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
| `CRASHLAB_GITHUB_SESSION_SECRET` | No | *(unset)* | HMAC signing secret for the opaque GitHub session cookie. Issuing or verifying browser sessions also requires shared Upstash Redis (`KV_REST_API_URL` and `KV_REST_API_TOKEN`); the app fails closed if that durable store is unavailable. When configured, a session resolves to a `github:<login>` principal whose role comes from the role store. **Do not set this while the OAuth code exchange is still stubbed** — the session then names the stub identity. |
| `CRASHLAB_GITHUB_SESSION_TTL_SECONDS` | No | `43200` | Browser cookie lifetime in seconds, capped at the 12-hour absolute session timeout. Sessions also expire after 30 minutes without activity; each successful verification refreshes the idle timer. |
| `CRASHLAB_OIDC_SESSION_SECRET` | No | *(unset)* | HMAC signing secret for OIDC opaque session cookies. OIDC sessions use the same durable Redis store and 30-minute idle / 12-hour absolute timeouts as GitHub sessions. |
| `CRASHLAB_RBAC_AUDIT_RETENTION_DAYS` | No | `90` | Age-based retention for the RBAC authorization audit log. Entries older than this are filtered out on read. |
| `CRASHLAB_RBAC_AUDIT_MAX_ENTRIES` | No | `10000` | Hard cap on retained RBAC audit entries. The oldest are dropped once the cap is reached. |
| `CRASHLAB_RBAC_ROLE_AUDIT_MAX_ENTRIES` | No | `1000` | Hard cap on retained role-assignment change entries. |

**Durability**: role assignments and both audit logs are written through the
record driver layer (`apps/web/src/lib/storage/record-driver.ts`). When
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are set, that is Upstash Redis and the
writes survive the invocation. When they are not, the in-memory driver is used,
which is a single-instance store — adequate for local development, and not a
durable audit trail for a multi-instance deployment.

**Browser sessions**: GitHub and OIDC cookies contain only a random session ID
and HMAC. The session identity and timestamps are stored in the record store;
the record also holds an HMAC of the login-time User-Agent, never the raw
User-Agent. Each verification compares it with the request's User-Agent and
rejects a mismatch. Sessions are not bound to IP addresses.
login rotates the ID and invalidates the prior record. `POST /api/auth/logout`
revokes the presented record. Redis must be configured for session issuance
and verification; there is no in-memory fallback. Production cookies use
`__Host-` names, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.

**Identity sources**:
- `Authorization: Bearer <secret>` matching `CRASHLAB_WEBHOOK_API_KEY` — principal `api-key:env:CRASHLAB_WEBHOOK_API_KEY`
- `Authorization: Bearer <secret>` matching a token issued by `/api/settings/tokens` — principal `api-key:<token id>`
- The opaque GitHub session cookie (`crashlab_github_session` in development,
  `__Host-crashlab_github_session` in production) — principal `github:<login>`

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
| `NEXT_PUBLIC_SENTRY_DSN` | No | empty | Web app, Sentry SDK (`apps/web/src/lib/integrations/sentry-client.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`) | Sentry Data Source Name (DSN) for client, server and edge error tracking. Validated at boot: when omitted or malformed (not `https://<key>@<host>/<project id>`, or carrying a secret key) Sentry stays off and error reporting falls back to console logging. Safe to expose publicly in client bundles. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | `NEXT_PUBLIC_VERCEL_ENV` / `VERCEL_ENV`, else `NODE_ENV` | Sentry SDK (all runtimes) | Environment events and sessions are filed under (e.g. `production`, `preview`, `self-hosted`). |
| `NEXT_PUBLIC_SENTRY_RELEASE` | No | set at build | Sentry SDK (all runtimes) | Written by `apps/web/next.config.ts` from `SENTRY_RELEASE` or `soroban-crashlab-web@<package version>+<git sha>` so runtime events match the uploaded source maps. Do not set by hand. |

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
| `SENTRY_RELEASE` | No | `soroban-crashlab-web@<version>+<sha>` | `apps/web/next.config.ts` | Explicit release identifier override. If not set, the release is `soroban-crashlab-web@<apps/web package.json version>+<git sha>`, with the SHA from `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or local git (`git rev-parse HEAD`). |
| `SENTRY_UPLOAD_SOURCEMAPS` | No | `false` | `apps/web/next.config.ts` | `true` uploads hidden source maps tied to the release, creates and finalises the release and attaches commits. Requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (the build fails if they are missing). Off: nothing is uploaded and no credentials are needed. See [`docs/self-hosting/observability.md`](self-hosting/observability.md). |
| `SENTRY_TUNNEL_ROUTE` | No | *(unset)* | `apps/web/next.config.ts` | Path such as `/monitoring` that proxies Sentry traffic through the app so ad blockers do not drop events. |

### API & Issue Configuration
| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `RUNS_API_URL` | No | empty | Run API routes | Optional backend URL for run detail and replay requests. |
| `ISSUES_API_URL` | No | `NEXT_PUBLIC_API_URL` | Issue-link routes | Backend URL for issue-link creation and verification. |

### CI Regression Results (`apps/web/src/app/api/integrations/ci/results/route.ts`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `CRASHLAB_CI_REPOSITORY` | Recommended in production | *(unset)* | `owner/repo` whose workflows may post results (case-insensitive). Unset accepts any repository the `ci:write` token's holder posts for. See [`docs/REGRESSION_SUMMARY.md`](REGRESSION_SUMMARY.md). |

### Campaign Capacity (`apps/web/src/lib/capacity/`)
| Variable | Required | Default | Description |
|---|---|---|---|
| `CRASHLAB_QUOTA_CONCURRENT_WORKERS` | No | *(unlimited)* | Workers all running campaigns may hold at once. |
| `CRASHLAB_QUOTA_SEEDS_PER_DAY` | No | *(unlimited)* | Seeds per UTC day across campaigns. |
| `CRASHLAB_QUOTA_RPC_CALLS_PER_DAY` | No | *(unlimited)* | RPC calls per UTC day across campaigns. |
| `CRASHLAB_QUOTA_STORAGE_GB` | No | *(unlimited)* | Artifact storage; at the limit no new campaign is admitted. |
| `CRASHLAB_SCHEDULING_WINDOWS` | No | *(always open)* | UTC windows per class, e.g. `deep=00:00-06:00,nightly=20:00-08:00`. Interactive campaigns cannot be windowed. |

Limits apply to the `global` scope; lower-priority classes keep headroom free for higher ones. See [`docs/ops/capacity.md`](ops/capacity.md).

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

### `CRASHLAB_RUNNER`
- **Required**: No
- **Default**: `mock`
- **Values**:
  - `mock` *(default)*: In-process mock runner. Returns deterministic signatures without any network or host access. Used in unit tests and CI where no Soroban environment is available.
  - `host`: Soroban SDK testutils-based sandbox runner. Requires the `host-runner` Cargo feature to be enabled at compile time (`--features host-runner`). Used for integration tests against a local contract binary.
  - `rpc`: RPC-backed runner that submits transactions to a live Soroban RPC endpoint. Requires the `rpc-runner` Cargo feature (`--features rpc-runner`) **and** both companion variables below.
- **Companion variables (required when `CRASHLAB_RUNNER=rpc`)**:
  - `CRASHLAB_RPC_URL`: Full URL of the Soroban RPC endpoint (e.g. `https://rpc-futurenet.stellar.org:443`). Must begin with `http://` or `https://`. Missing or empty → `RunnerCreationError::Misconfigured`.
  - `CRASHLAB_CONTRACT_ID`: Soroban contract ID (G-address format) to target. Missing or empty → `RunnerCreationError::Misconfigured`.
- **Error behaviour**: An unrecognised value yields `RunnerCreationError::InvalidRunnerType` with the message `"invalid runner type: '<value>'. Supported types: mock, host, rpc"`. Requesting `host` or `rpc` without the matching Cargo feature yields `RunnerCreationError::FeatureNotEnabled`.

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

### Retention Sweep Configuration
These variables configure the behavior of `crashlab retention sweep`:

- `CRASHLAB_SWEEP_DRY_RUN`: Set to `1` or `true` (or pass `--dry-run`) to simulate pruning without deleting any directories or files.
- `CRASHLAB_HEARTBEAT_TTL_SECS`: Heartbeat freshness window in seconds (or pass `--heartbeat-ttl <secs>`). Defaults to stale detector threshold (60s). Active runs with fresh heartbeats or locked advisory files are protected from deletion.
- `CRASHLAB_SWEEP_GRACE_PERIOD_SECS`: Grace period in seconds (or pass `--grace-period <secs>`) between marking candidates and deletion.
- `CRASHLAB_RETENTION_MAX_RUNS`: Maximum number of completed run directories to retain (default: 50).
- `CRASHLAB_RETENTION_MAX_DAYS`: Maximum age in days before pruning completed run directories (default: 30).
- `CRASHLAB_RETENTION_MAX_FAILURE_BUNDLES`: Maximum failure bundles to retain per run directory (default: 50).
- `CRASHLAB_RETENTION_MAX_CHECKPOINTS`: Maximum checkpoints to retain per run directory (default: 10).

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
