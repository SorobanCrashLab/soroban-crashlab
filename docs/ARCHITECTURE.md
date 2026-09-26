# Architecture

How Soroban CrashLab's pieces fit together: the Next.js dashboard, the Rust
fuzzing engine, runners, storage drivers, and the fixture/replay lifecycle.

> Design rationale for individual choices lives in [ADRs](adr/README.md).
> **Update rule:** PRs that change architecture (data mode, runners, storage
> drivers, campaign/replay flow, or system boundaries) must update this file.
> See the review checklist in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## System diagram

```
Browser (apps/web UI)
    │  fetch / EventSource
    ▼
Next.js App Router  ── /api/* routes ──►  mock handlers (NEXT_PUBLIC_ENABLE_MOCK_DATA)
    │                         │
    │                         └── tryBackend() ──► upstream NEXT_PUBLIC_API_URL / RUNS_API_URL
    │
    ├── storage drivers (server-only)
    │     • in-memory (default)
    │     • KV / Upstash (KV_REST_API_*)
    │     • S3 / MinIO (CRASHLAB_STORAGE_DRIVER=s3)
    │     • local FS artifacts (CRASHLAB_ARTIFACT_DIR)
    │
    └── migration runner (boot) ──► sqlite / postgres / KV key-revision sweeps

CLI / CI (contracts/crashlab-core)
    │  CRASHLAB_RUNNER=mock|host|rpc
    ▼
ContractRunner
    ├── MockRunner          — deterministic signatures (CI / default)
    ├── HostContractRunner  — soroban-sdk testutils (feature: host-runner)
    └── RpcContractRunner   — live Soroban RPC (feature: rpc-runner)
              │
              ▼
         CaseBundle JSON ──► fixture sanitize / corpus / replay / CI pack
```

Example contract under test: `contracts/soroban-example` (WASM build + size budget in CI).

---

## Mock vs backend data mode

Decision tree used by API routes (`api-base.ts`, `api-proxy.ts`, run routes):

```
Is NEXT_PUBLIC_API_URL (or route-specific RUNS_API_URL / ISSUES_API_URL) set?
  ├─ yes → tryBackend(url, path, …, fallback)
  │         ├─ upstream OK  → proxy JSON
  │         └─ upstream fail → 502/503 (no silent invention of progress)
  └─ no  → Is NEXT_PUBLIC_ENABLE_MOCK_DATA !== "false"?
            ├─ yes → serve in-process mock data (default for local + early deploys)
            └─ no  → fail closed / empty (production misconfig)
```

Notes:

- `API_BASE` in `apps/web/src/lib/api-base.ts` is **build-time** (browser bundle).
- Server routes re-read `process.env.NEXT_PUBLIC_API_URL` at request time so tests
  and runtime config work.
- SSE run streams (`/api/runs/[id]/stream`) must not fabricate telemetry when a
  snapshot lookup fails — they close cleanly instead.

---

## Runner matrix (`CRASHLAB_RUNNER`)

Selected in `contracts/crashlab-core/src/runner.rs` via `create_runner()`.

| Value | Implementation | Feature flag | Status |
|---|---|---|---|
| `mock` (default / unset) | `MockRunner` | none | **Real** — deterministic crash signatures for tests/CI |
| `host` | `HostContractRunner` | `host-runner` | **Real** when feature enabled; loads WASM from `CRASHLAB_CONTRACT_WASM` or bundled fixture |
| `rpc` | `RpcContractRunner` | `rpc-runner` | **Real** when feature enabled; requires `CRASHLAB_RPC_URL` + `CRASHLAB_CONTRACT_ID` |

Related: `CRASHLAB_PRESET` (`smoke` / `nightly` / `deep`), `CRASHLAB_STATE_DIR`,
`CRASHLAB_OUTPUT_FORMAT=json` for the Rust ↔ web bridge.

Known gaps (document honestly; link issues when filing follow-ups):

- Host/RPC runners still need operators to enable Cargo features and supply WASM/RPC
  config; default CI stays on `mock`.
- Some dashboard integration pages historically mocked capabilities that the
  storage/migration layer is catching up to (see migration framework below).

---

## Campaign lifecycle

```
start campaign (preset / CLI)
    → mutate seeds → run through ContractRunner
    → classify (taxonomy) + auth matrix
    → checkpoint run state (CRASHLAB_STATE_DIR)
    → persist CaseBundle (schema v1→v2 via bundle_persist)
    → flaky detection / filter_ci_pack
    → replay (deterministic) → regression fixtures / CI export
```

Web surfaces: run history, triage, replay controls, analytics. Artifacts land in
the configured storage driver or `CRASHLAB_ARTIFACT_DIR`.

---

## Fixture / corpus flow

1. Stable `CaseBundle` documents written at `CASE_BUNDLE_SCHEMA_VERSION` (v2;
   v1 still loadable — see `bundle_persist.rs`).
2. Fixture sanitize (`fixture_sanitize.rs`) redacts secrets before sharing.
3. Corpus import/export binaries under `contracts/crashlab-core/src/bin/`.
4. `check-fixtures` validates on-disk fixtures against the current schema.
5. Web config bundles use a separate versioned migrator
   (`apps/web/src/app/settings/config-bundle/bundle-migrations.ts`).

---

## Storage & migrations

| Layer | Location | Notes |
|---|---|---|
| Artifact blobs | `lib/storage` drivers | Default in-memory; S3 opt-in |
| Run metadata | in-memory / KV run drivers | |
| DB boot | `lib/database` | Detects sqlite / postgres / vercel-postgres |
| Schema evolution | `lib/database/migration-runner.ts` + `migrations/` | Ordered, checksummed; baseline `000`; KV key-revision sweeps |

PRs that change persisted shapes must add an explicit migration and update this
section.

---

## Directory map (high level)

```
apps/web/                 Next.js dashboard + /api routes + storage/migration
contracts/crashlab-core/  Rust engine (mutators, runners, campaigns, replay)
contracts/soroban-example Example Soroban contract (WASM)
docs/                     Canonical docs (this file, DEPLOYMENT, ENV, …)
scripts/                  Maintainer + CI audit scripts
.github/workflows/        GitHub Actions (no GitLab CI)
```

---

## Related

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Vercel + Docker paths and deploy gating
- [`ENV.md`](ENV.md) — environment variable contract
- [`REPRODUCIBILITY.md`](REPRODUCIBILITY.md) — deterministic replay guarantees
- [`API.md`](API.md) — HTTP surface of the dashboard
