# Deployment Guide

Canonical deployment documentation for Soroban CrashLab. There is no GitLab
pipeline in this repository — CI/CD runs on GitHub Actions, and the first-class
hosting paths are **Vercel** (web dashboard) and **Docker Compose** (self-host).

---

## Deploy paths at a glance

| Path | Entry point | Who it is for |
|---|---|---|
| Vercel | [`vercel.json`](../vercel.json) + GitHub → Vercel | Hosted dashboard (recommended) |
| Docker Compose (dev) | [`docker-compose.yml`](../docker-compose.yml) `web` service + [`apps/web/Dockerfile`](../apps/web/Dockerfile) `dev` target | Local iteration |
| Docker Compose (prod) | `web-prod` service (`--profile prod`) + Dockerfile `runner` target | Self-hosted production image |
| Rust core (optional) | `core` service (`--profile core`) + [`contracts/crashlab-core/Dockerfile`](../contracts/crashlab-core/Dockerfile) | Containerized fuzz engine builds |

Environment variables for every path are documented in [`ENV.md`](ENV.md). Copy
`apps/web/.env.example` → `apps/web/.env.local` for Next.js, or
`.env.docker.example` → `.env` for Compose (`env_file: .env`).

---

## 1. Deploy to Vercel

Vercel is the recommended host for `apps/web`. Root [`vercel.json`](../vercel.json)
pins the monorepo build:

| Setting | Value |
|---|---|
| Framework | `nextjs` |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter web build` |
| Output | `apps/web/.next` |
| Dev | `pnpm --filter web dev` |
| Auto-deploy | enabled on `main` |

### Steps

1. Push to GitHub (this repo is GitHub-hosted; there is no GitLab mirror required).
2. Import the repository at [vercel.com](https://vercel.com).
3. Confirm the project picks up `vercel.json` (defaults usually work).
4. Set environment variables in **Project → Settings → Environment Variables**
   (Production + Preview as needed). Minimum for a browsable dashboard:

| Variable | Classification | Example / notes |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | public | `true` until a real backend is wired |
| `NEXT_PUBLIC_APP_URL` | public | Your Vercel URL (`https://….vercel.app`) |
| `NEXT_PUBLIC_API_URL` | public | Leave empty for same-origin `/api/*` |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Optional error reporting |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | secret / server-only | Only if uploading source maps |

Full tables (including storage drivers, webhooks, integrations): [`ENV.md`](ENV.md).

5. Deploy. Preview deploys are also driven by
   [`.github/workflows/vercel-preview.yml`](../.github/workflows/vercel-preview.yml)
   when Vercel secrets are present.

### Custom domain

Add the domain under Vercel → Domains. TLS is provisioned automatically.

---

## 2. Docker Compose (self-host)

Two Dockerfiles matter:

- `apps/web/Dockerfile` — multi-stage (`dev` + `runner` / production)
- `contracts/crashlab-core/Dockerfile` — optional Rust engine image

### Bootstrap env

```bash
cp .env.docker.example .env
# edit .env as needed
docker compose up web                 # http://localhost:3000 (HMR)
docker compose --profile prod up web-prod   # http://localhost:3001
docker compose --profile core build core    # Rust engine image
```

| Profile | Command | What starts |
|---|---|---|
| Default | `docker compose up web` | Dev server, bind-mounted source |
| `prod` | `docker compose --profile prod up web-prod` | Standalone production Next.js server |
| `core` | `docker compose --profile core build core` | crashlab-core image |

Compose healthchecks hit `/api/health/liveness` and honor
`CRASHLAB_METRICS_SCRAPE_TOKEN` when set.

### Docker env table (common)

| Variable | Classification | Purpose |
|---|---|---|
| `NODE_ENV` | server-only | `development` / `production` |
| `WATCHPACK_POLLING` | server-only | Hot reload inside containers |
| `NEXT_PUBLIC_ENABLE_MOCK_DATA` | public | Mock dashboard data |
| `DATABASE_TYPE` / `SQLITE_PATH` | server-only | Local persistence defaults |
| `CRASHLAB_METRICS_SCRAPE_TOKEN` | secret | Optional bearer for metrics/health probes |
| Integration tokens (`DISCORD_WEBHOOK_URL`, `SLACK_BOT_TOKEN`, …) | secret | Leave blank to disable |

---

## 3. Deploy gating (what must be green before deploy)

Deploy is gated by GitHub Actions — not by a GitLab trigger. Before merging to
`main` (which Vercel auto-deploys), treat these as required:

| Check | Workflow / job | Why it gates deploy |
|---|---|---|
| Secrets scan | `secrets-scan` (when present in CI) | Blocks credential leaks |
| Ops / scripts syntax | `ops-scripts-syntax` | Shell syntax + `scripts/audit-env.mjs` env drift |
| Web lint / unit / build | `web-lint`, `web-unit`, `web-build` | Dashboard must compile and test |
| E2E | Playwright e2e job | User paths still work on fresh install |
| Storage conformance | [`storage-minio.yml`](../.github/workflows/storage-minio.yml) | S3/MinIO driver contract (nightly / on storage changes) |
| Semantic PR title | [`semantic-pr.yml`](../.github/workflows/semantic-pr.yml) | Conventional Commits on the PR title |
| Soroban example size | `soroban-example` in [`ci.yml`](../.github/workflows/ci.yml) | WASM budget when contract code changes |
| Preview deploy | `vercel-preview.yml` | Optional; runs when Vercel secrets exist |

Production checklist:

- [ ] Env vars set on the host (Vercel or `.env`) — see [`ENV.md`](ENV.md)
- [ ] `NEXT_PUBLIC_ENABLE_MOCK_DATA=false` only when a real backend is configured
- [ ] Local verification: `pnpm lint`, `pnpm test`, `pnpm build`
- [ ] No secrets committed (examples use empty placeholders only)

---

## 4. Related docs

- [`ENV.md`](ENV.md) — full environment variable contract + secrecy classification
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how web, Rust core, runners, and storage fit together
- [`README.md`](README.md) — documentation index
- Root [`README.md`](../README.md) — quick start + short Vercel summary (points here for detail)

> **Removed:** the root `DEPLOYMENT.md` stub (git add/commit/push lines) and the
> dead `.gitlab-ci.yml` downstream trigger. Do not revive either file.
