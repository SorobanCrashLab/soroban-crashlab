# Environment Variables

This reference lists the environment variables used by Soroban CrashLab. For
local web development, copy `apps/web/.env.example` to `apps/web/.env.local`
and adjust only the values you need.

## Browser-exposed variables

Variables prefixed with `NEXT_PUBLIC_` are bundled into the browser build. Do
not put secrets, private tokens, or internal-only URLs in these values.

| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | empty | Web app, API routes | Base URL for the CrashLab backend. Leave empty to use mock data locally. Set this to the deployed backend URL when mock data is disabled. |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` locally, platform-detected in some deployments | Web app | Canonical web URL used for server-side fetches, report links, and run detail permalinks. Set this explicitly in production. |
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | No | `true` | API routes | Enables mock run data when no backend is configured. Set to `false` in production once `NEXT_PUBLIC_API_URL` points at a real backend. |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | No | empty | External auth integration UI | Public GitHub OAuth app client ID for the authentication integration page. The matching client secret must stay server-side and is not currently read by the app. |
| `NEXT_PUBLIC_VERCEL_ENV` | No | platform-provided | Settings UI | Vercel-provided deployment environment label. Local development can omit it. |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | No | empty | Hosting analytics | Optional public analytics identifier. Core CrashLab flows do not require it. |

## Server-only variables

These values are read only by Next.js server routes or middleware. Keep them out
of client-side code and do not prefix them with `NEXT_PUBLIC_`.

| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `RUNS_API_URL` | No | empty | Run detail and replay API routes | Optional backend URL for run detail and replay requests. When unset, those routes use local mock or fallback behavior. |
| `ISSUES_API_URL` | No | `NEXT_PUBLIC_API_URL` | Run issue-link API routes | Backend URL for issue-link creation and verification. Use when issue linking is served by a different API than the main backend. |
| `NOTIFICATIONS_FEED_ENABLED` | No | enabled unless set to a falsy value | Notifications API route | Set to `false`, `0`, `off`, or `no` to disable fetching the optional notifications feed. |
| `NOTIFICATIONS_FEED_URL` | No | empty | Notifications API route | URL for the optional notifications feed. Preferred over `NOTIFICATIONS_API_URL` when both are set. |
| `NOTIFICATIONS_API_URL` | No | empty | Notifications API route | Legacy fallback URL for the optional notifications feed. |
| `PROMETHEUS_ENDPOINT` | No | `http://localhost:9090` | Metrics health API route | Prometheus or exporter base URL used by `/api/health/metrics`. |
| `PROMETHEUS_HEALTH_PATH` | No | `/-/healthy` | Metrics health API route | Health path queried on the Prometheus endpoint. |
| `PROMETHEUS_TIMEOUT_MS` | No | `5000` | Metrics health API route | Timeout, in milliseconds, for Prometheus health checks. |
| `CRASHLAB_API_RATE_LIMIT_WINDOW_MS` | No | `60000` | API proxy middleware | Rolling rate-limit window for `/api/*` requests. Must be a positive integer. |
| `CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS` | No | `120` | API proxy middleware | Maximum `/api/*` requests per client key within the rate-limit window. Must be a positive integer. |
| `CRASHLAB_ARTIFACT_DIR` | No | OS temp directory + `crashlab-artifacts` | Artifact filesystem adapter | Directory used by the local artifact adapter for uploaded or generated artifacts. |

## Local examples

Minimal local dashboard with mock data:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_MOCK_DATA=true
NEXT_PUBLIC_API_URL=
```

Local dashboard connected to a backend:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
```

Production frontend connected to a deployed backend:

```bash
NEXT_PUBLIC_APP_URL=https://your-crashlab.example.com
NEXT_PUBLIC_API_URL=https://api.your-crashlab.example.com
NEXT_PUBLIC_ENABLE_MOCK_DATA=false
CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS=120
CRASHLAB_API_RATE_LIMIT_WINDOW_MS=60000
```

## Deployment notes

- Restart the Next.js dev server after changing `.env.local`.
- Redeploy the web app after changing Vercel or hosting provider variables.
- Treat every variable without the `NEXT_PUBLIC_` prefix as server-only.
- Keep `NEXT_PUBLIC_ENABLE_MOCK_DATA=false` in production environments that
  should fail closed when the backend is unavailable.
