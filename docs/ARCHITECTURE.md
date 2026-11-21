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

## Command palette

The global Cmd/Ctrl+K palette is mounted with the deferred app chrome and uses
the server-safe singleton in `apps/web/src/lib/command-palette/registry.ts`.
Features register static commands through `registerCommand` or
`useCommandRegistration`; async providers contribute query-driven results and
can restrict themselves with a route context predicate. The registry applies
weighted fuzzy matching (title, description, keywords), filters commands by
the current pathname, and merges recently used ids from browser storage into
the ranking. Providers receive an abort signal so stale searches are discarded.

The client palette owns keyboard navigation, nested command menus, argument
prompts, async execution feedback, and accessible combobox announcements.
Run search is a route-scoped provider in
`apps/web/src/app/command-palette-runs-provider.ts`; built-in navigation and
actions are registered from `command-palette-static-entries.ts`. Command
registration itself does not access browser globals, so the registry and
feature contributions remain usable during server rendering.

**Capacity (#1904).** `POST /api/campaigns` admits a campaign only if its class
window is open and the scope's quotas allow it, then records a lease in the
capacity ledger (`apps/web/src/lib/capacity/`). Runners report progress to
`POST /api/capacity/usage`, which renews the lease and answers a mid-run
throttle; the engine enforces the same priority headroom in-process via
`QuotaGuard` (`crashlab run start --seed-quota`). The schedules tick defers
windowed classes and orders runs by priority. Known gap: the ledger is
per-instance in memory. See [`ops/capacity.md`](ops/capacity.md).

**CI regression loop (#1890, #1891).** The Regression Test Suite workflow runs
`crashlab regression-suite --report`, classifies the report against
`contracts/crashlab-core/regression-baseline.json` (new / recurring / fixed /
unchanged), gates on new failures, and publishes the result to the PR (sticky
comment + check run) and to `POST /api/integrations/ci/results`, which backs the
per-commit view on the CI replay page. See
[`REGRESSION_SUMMARY.md`](REGRESSION_SUMMARY.md).

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
├── src/lib/artifact-security/  Multi-layer artifact security
│   ├── scanning/           ClamAV + YARA malware scanning
│   ├── verification/       Sigstore/cosign + Ed25519 signatures
│   ├── sandbox/            gVisor/Kata reproduction sandbox
│   ├── supplychain/        SLSA, SBOM, vulnerability scanning
│   └── quarantine/         Quarantine workflow & review UI
contracts/crashlab-core/  Rust engine (mutators, runners, campaigns, replay)
├── src/sandbox/          Core sandbox enhancements
│   ├── gvisor.rs         gVisor integration
│   ├── kata.rs           Kata Containers
│   ├── seccomp.rs        Seccomp profile generation
│   ├── attestation.rs    Result signing
│   └── resource_limits.rs cgroups v2 limits
contracts/soroban-example Example Soroban contract (WASM)
docs/                     Canonical docs (this file, DEPLOYMENT, ENV, …)
scripts/                  Maintainer + CI audit scripts
.github/workflows/        GitHub Actions (no GitLab CI)
infrastructure/           Deployment artifacts
├── sandbox/              gVisor/Kata Dockerfiles, seccomp, containerd config
├── scanning/             ClamAV, YARA rules & Dockerfiles
└── supplychain/          slsa-verifier, cosign Dockerfiles
```

---

## Artifact Security Architecture

### Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Artifact Security                                    [🔒 Quarantine: 3]    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  UPLOAD PIPELINE                                                        │ │
│  │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  │ │
│  │  │ Upload  │──▶│ ClamAV  │──▶│ YARA    │──▶│ Sig     │──▶| Quarantine│  │ │
│  │  │         │   │ Scan    │   │ Rules   │   │ Verify  │   │ / Release │  │ │
│  │  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘  │ │
│  │       │            │            │            │            │             │ │
│  │       ▼            ▼            ▼            ▼            ▼             │ │
│  │  Chunked      Multi-engine   Custom rules  Cosign/     Policy:         │ │
│  │  upload       (ClamAV +      (packers,      Sigstore    - Malware→Q     │ │
│  │  + resumable  custom)        cryptominers)  verify      - YARA→Q        │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  REPRODUCTION SANDBOX                                                   │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │ │
│  │  │  gVisor / Kata Containers                                         │  │ │
│  │  │  ├── No host network                                              │  │ │
│  │  │  ├── Read-only rootfs                                             │  │ │
│  │  │  ├── CPU/memory limits (cgroups v2)                               │  │ │
│  │  │  ├── Seccomp profile (minimal syscalls)                           │  │ │
│  │  │  ├── No capability (CAP_DROP=ALL)                                 │  │ │
│  │  │  └── Ephemeral storage (tmpfs, no persist)                        │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │  Reproducer Verification:  Sigstore cosign verify --certificate...     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  SUPPLY CHAIN INTEGRITY                                                 │ │
│  │  SLSA Level 3:  ✓ Provenance  ✓ Reproducible  ✓ Signed  ✓ Verified    │ │
│  │  SBOM:  CycloneDX + SPDX  |  Vulnerability Scan:  Grype/Trivy          │ │
│  │  [Generate Attestation] [Verify Attestation] [View SBOM]               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Upload Pipeline

1. **Chunked Upload**: Artifacts uploaded via UploadThing with resumable chunks
2. **ClamAV Scan**: Multi-engine malware detection via clamd daemon
3. **YARA Rules**: Custom rules for packers, cryptominers, exploit kits
4. **Signature Verification**: Cosign/Sigstore for reproducers, Ed25519 for crash bundles
5. **Quarantine Decision**: Policy-based (strict/standard/permissive) with review queue

### Reproduction Sandbox

- **Runtime**: gVisor (ptrace/KVM) or Kata Containers (hardware virtualization)
- **Isolation**: No network, read-only rootfs, minimal syscalls (seccomp), no capabilities
- **Resources**: CPU/memory/pids limits via cgroups v2, ephemeral tmpfs storage
- **Attestation**: Execution results signed by sandbox for verification

### Supply Chain Integrity

- **SLSA Level 3**: Provenance generation, reproducible builds, signed artifacts, verification
- **SBOM**: CycloneDX 1.6 + SPDX 2.3 for all artifacts
- **Vulnerability Scanning**: Grype + Trivy integration
- **Verification**: slsa-verifier and cosign for artifact verification

### Quarantine Management

- **Review Queue**: UI for security team to inspect quarantined artifacts
- **Approval Workflow**: 2-person approval required for release
- **Retention**: 90-day auto-delete with manual override
- **Safe Inspection**: Base64 encoding for web viewing, no direct execution

---

## Related

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Vercel + Docker paths and deploy gating
- [`ENV.md`](ENV.md) — environment variable contract
- [`REPRODUCIBILITY.md`](REPRODUCIBILITY.md) — deterministic replay guarantees
- [`API.md`](API.md) — HTTP surface of the dashboard
- [`SECURITY.md`](SECURITY.md) — Security policy and artifact handling procedures
- [`THREAT_MODEL_ARTIFACT_HANDLING.md`](THREAT_MODEL_ARTIFACT_HANDLING.md) — STRIDE threat model
