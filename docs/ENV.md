# Environment Variables Reference

This reference lists and explains the environment variables used by Soroban CrashLab.

For local web development, copy `apps/web/.env.example` to `apps/web/.env.local` and adjust only the values you need.

---

## 1. Artifact Storage Configuration

### `CRASHLAB_ARTIFACT_DIR`
- **Required**: No
- **Default**: OS temp directory + `crashlab-artifacts` (e.g. `/tmp/crashlab-artifacts` on Linux)
- **Used by**: Next.js frontend web app (`apps/web/src/lib/artifact-fs-adapter.ts`)
- **Description**: Specifies the filesystem directory used by the local artifact adapter for storing, listing, downloading, and deleting uploaded or generated crash artifacts.

---

## 2. Fuzzer Runner Configuration

The fuzzer runner executes case seeds against the smart contract under test. You can control which runner implementation is selected using `CRASHLAB_RUNNER`.

### `CRASHLAB_RUNNER`
- **Required**: No
- **Default**: `mock`
- **Used by**: `contracts/crashlab-core/src/runner.rs`
- **Values**:
  - `mock`: Uses the `MockRunner` which returns a deterministic crash signature for testing/CI purposes without spinning up a real contract environment.
  - `host`: Uses the `HostContractRunner` which executes contract calls using the `soroban-sdk` test utils.
    - *Note*: Selecting `host` requires that the `host-runner` Cargo feature is enabled when building/running the `crashlab-core` crate.

### Other Runners (Programmatic)
- **`RpcContractRunner`**: Programmatically connects to a Soroban RPC URL (e.g. `https://rpc-futurenet.stellar.org:443`) to execute seeds against a live or test network. It is configured directly with the RPC endpoint and contract ID rather than environment variables.

---

## 3. Authentication & OAuth Configuration

### `NEXT_PUBLIC_GITHUB_CLIENT_ID`
- **Required**: No (Only needed if enabling GitHub authentication integration)
- **Default**: empty
- **Used by**: External auth integration UI (`apps/web/src/app/integrate-external-authentication-integration.tsx`)
- **Description**: The public GitHub OAuth Application client ID. Used by the browser to construct the authorize URL:
  `https://github.com/login/oauth/authorize`
  requesting the `read:user` scope.

### Security Boundary & Secrets
- **OAuth Callback**: Redirection from GitHub is handled by the server-side callback route `/api/auth/github/callback` (`apps/web/src/app/api/auth/github/callback/route.ts`).
- **OAuth Secret**: The corresponding client secret must remain strictly server-side (never prefixed with `NEXT_PUBLIC_`) and is not exposed to client-side code.

### `CRASHLAB_WEBHOOK_API_KEY`
- **Required**: No
- **Default**: empty (no authentication enforced)
- **Used by**: Webhook API routes (`apps/web/src/app/api/webhooks/route.ts`)
- **Description**: When set, all `GET`, `POST`, `PATCH`, and `DELETE` requests to `/api/webhooks` must include an `Authorization: Bearer <key>` header that matches this value exactly. The comparison is performed using a timing-safe algorithm to prevent side-channel attacks. Requests with a missing or incorrect token are rejected with HTTP 401. When this variable is absent or empty, the endpoint is unauthenticated (existing behaviour is preserved for deployments that have not yet configured this variable).

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
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_MOCK_DATA=true
```

### Local Dashboard with Backend and Local Artifact Storage
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
CRASHLAB_ARTIFACT_DIR=/var/tmp/crashlab-artifacts
```

### Production Frontend with Rate Limiting
```bash
NEXT_PUBLIC_APP_URL=https://your-crashlab.example.com
NEXT_PUBLIC_API_URL=https://api.your-crashlab.example.com
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS=120
CRASHLAB_API_RATE_LIMIT_WINDOW_MS=60000
```

---

## 7. Sentry Source Maps & Release Verification Recipe (Preview Deploy)

This recipe describes how to verify that Sentry source maps upload and release tagging work end-to-end on a preview deployment.

### Prerequisites

1. Set the following environment variables in Vercel Project Settings (`Settings > Environment Variables`, scoped to **Preview** and **Production**):
   - `NEXT_PUBLIC_SENTRY_DSN`: Your Sentry project DSN.
   - `SENTRY_AUTH_TOKEN`: Secret Sentry auth token (with `project:releases` and `org:read` scopes).
   - `SENTRY_ORG`: Your Sentry organization slug.
   - `SENTRY_PROJECT`: Your Sentry project slug.
2. In GitHub repository secrets (`Settings > Secrets and variables > Actions`), ensure `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are configured.

### Step 1: Trigger Preview Deployment

1. Open a pull request against `main` (or push a commit to an existing PR).
2. The `.github/workflows/vercel-preview.yml` action triggers.
3. Review the action build logs under **Build Project Artifacts**:
   - Verify that `@sentry/nextjs` / Sentry Webpack Plugin runs.
   - Verify that client and server bundles generate hidden source maps.
   - Verify that source maps are uploaded to Sentry and tagged with the git commit SHA release (`VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`).
   - Verify that client-side `.map` files are deleted post-upload (`deleteSourcemapsAfterUpload: true`).

### Step 2: Trigger Intentional Test Error on Preview URL

1. Open the preview deployment URL posted on the pull request comment by the bot.
2. Open the browser Developer Tools console (`F12` or `Cmd+Option+I`).
3. Execute an intentional test error to trigger Sentry reporting:
   ```javascript
   // Trigger an unhandled exception captured by Sentry
   setTimeout(() => {
     throw new Error("Sentry verification test error: preview deploy symbolication check");
   }, 0);
   ```
   Or trigger a captured exception via the client console:
   ```javascript
   window.dispatchEvent(new ErrorEvent('error', {
     error: new Error("Sentry verification test error: preview deploy symbolication check")
   }));
   ```

### Step 3: Validate in Sentry Dashboard

1. Navigate to your Sentry dashboard and go to **Issues**.
2. Locate the new issue with title `Error: Sentry verification test error: preview deploy symbolication check`.
3. Check the **Release**:
   - Verify that the release tag matches the PR's git commit SHA (`git rev-parse --short HEAD`).
   - Verify commit tracking displays associated commits for the release (`setCommits`).
4. Check the **Stack Trace**:
   - Verify that the frames are cleanly symbolicated with original source code filenames (e.g. `src/lib/...`, `src/app/...`) and exact line numbers.
   - Confirm there are **no mangled or minified stack frames** (e.g. no raw references like `chunks/452-a1b2c3d.js:1:1234`).
5. Check **Source Maps Privacy**:
   - Try accessing a `.map` URL directly in the browser (e.g. `https://<preview-url>/_next/static/chunks/main-<hash>.js.map`).
   - Confirm that the response is `404 Not Found`, proving source maps are deleted from the public web server and exist only within Sentry.

