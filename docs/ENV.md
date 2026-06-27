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

---

## 5. Server-Only Variables

These values are read only by Next.js server routes or middleware. Keep them out of client-side code and do not prefix them with `NEXT_PUBLIC_`.

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
