# Where to start

How to find your way into the Wave 5 issue batch (#1781–#1904) without
picking up something that is blocked, or combining work that must land
separately. Read the [architecture guide](architecture.md) first if you have
not worked in this repository before.

## How to use this page

1. Pick a **theme** below that matches what you know (Rust engine, web,
   security, CI, ops/docs).
2. Follow the theme's **prerequisite chain**: an issue whose prerequisite is
   still open is blocked — choose the prerequisite instead, or one with none.
3. Read the files in the theme's **reading order** before you comment
   "I'll take it"; most issues assume them.
4. Respect the **do-not-combine** boundaries: one issue per PR, always.

The `W5-<theme><nn>` IDs are how issues refer to each other ("requires
W5-A01"). The table at the end maps every ID to its issue. The mapping follows
issue order within each theme and is cross-checked against the references in
the issue bodies; if an issue says otherwise, the issue wins — please fix this
page.

## Themes at a glance

| Theme | Issues | Stack | Entry points (reference no other W5 issue) | Reading order |
|---|---|---|---|---|
| **A** Real host execution and RPC | #1781–#1792 | Rust | A01 #1781, A06 #1786, A10 #1790, A11 #1791 | [`runner.rs`](../../contracts/crashlab-core/src/runner.rs) → [`host_runner.rs`](../../contracts/crashlab-core/src/host_runner.rs) → [`rpc_runner.rs`](../../contracts/crashlab-core/src/rpc_runner.rs) → ADR [0003](../adr/0003-auth-matrix-testing.md) |
| **B** Determinism, persistence and replay | #1793–#1802 | Rust | B02 #1794, B04 #1796, B06 #1798, B10 #1802 | ADR [0002](../adr/0002-deterministic-replay-prng.md), [0008](../adr/0008-run-lifecycle-and-checkpoint-recovery.md) → [`prng.rs`](../../contracts/crashlab-core/src/prng.rs) → [`checkpoint.rs`](../../contracts/crashlab-core/src/checkpoint.rs) → [`bundle_persist.rs`](../../contracts/crashlab-core/src/bundle_persist.rs) → [REPRODUCIBILITY.md](../REPRODUCIBILITY.md) |
| **C** Security hardening | #1803–#1818 | TypeScript | C01 #1803, C03 #1805, C06 #1808, C07 #1809, C12 #1814 | [SECURITY.md](../../SECURITY.md) → [threat model](../THREAT_MODEL_ARTIFACT_HANDLING.md) → [`rbac.ts`](../../apps/web/src/lib/rbac.ts) → [`proxy.ts`](../../apps/web/src/proxy.ts) |
| **D** CI quality gates | #1819–#1832 | CI | D02 #1820, D07 #1825, D08 #1826, D14 #1832 | [`.github/workflows/`](../../.github/workflows/) → [CI_CONCURRENCY_AUDIT.md](../CI_CONCURRENCY_AUDIT.md) → [`vitest.config.ts`](../../apps/web/vitest.config.ts) |
| **E** Runtime and API reliability | #1833–#1846 | TypeScript | E01 #1833, E10 #1842 | [`api/runs/route.ts`](../../apps/web/src/app/api/runs/route.ts) → [`storage/`](../../apps/web/src/lib/storage/) → [RUN_LIFECYCLE.md](../RUN_LIFECYCLE.md) |
| **F** Fuzzing intelligence | #1847–#1860 | Rust | F01 #1847 | [`havoc.rs`](../../contracts/crashlab-core/src/havoc.rs) → [`scheduler.rs`](../../contracts/crashlab-core/src/scheduler.rs) → [`seed_novelty.rs`](../../contracts/crashlab-core/src/seed_novelty.rs) → ADR [0004](../adr/0004-failure-classification-taxonomy.md) |
| **G** Regression, reproducers and signatures | #1861–#1870 | Rust + TS | G01 #1861, G02 #1862, G09 #1869 | ADR [0004](../adr/0004-failure-classification-taxonomy.md), [0005](../adr/0005-flaky-detection-and-ci-quarantine.md) → [`regression_suite.rs`](../../contracts/crashlab-core/src/regression_suite.rs) → [`scenario_export.rs`](../../contracts/crashlab-core/src/scenario_export.rs) |
| **H** Dashboard UX | #1871–#1886 | TypeScript | none — each builds on A/E/G work; pick one whose chain below is merged | ADR [0007](../adr/0007-standalone-web-dashboard-with-mock-fallback.md) → [`app/runs/[id]/page.tsx`](../../apps/web/src/app/runs/[id]/page.tsx) → [`api-client.ts`](../../apps/web/src/lib/api-client.ts) |
| **I** Integrations and platform | #1887–#1896 | TypeScript + ops | none — pick one whose chain below is merged | [INTEGRATIONS.md](../INTEGRATIONS.md) → [`lib/integrations/`](../../apps/web/src/lib/integrations/) → [WEBHOOKS.md](../WEBHOOKS.md) |
| **J** Operations, docs and governance | #1897–#1904 | Docs + ops | none — docs that describe other themes' work; check the issue's Related line | [DEPLOYMENT.md](../DEPLOYMENT.md) → [release policy](../releases/policy.md) → [backup and restore](../ops/backup-restore.md) |

## Prerequisite chains

`X → Y` means *Y needs X merged first*. Taken from the "requires / follows /
extends / depends" lines of the issues.

- **A:** A01 #1781 → A02 #1782, A03 #1783 → A04 #1784 (needs A01–A03) → A05 #1785.
  A06 #1786 → A07 #1787, A08 #1788. A01 → **F12 #1858** (stateful sequences need a real host).
- **B:** B01 #1793 → B07 #1799, E06 #1838. B04 #1796 → B05 #1797.
  B06 #1798 → B08 #1800, A09 #1789. B10 #1802 → E11 #1843 → J04 #1900.
- **C:** C01 #1803 → C02 #1804 → C12 #1814 → C15 #1817 → H10 #1880, I08 #1894.
  C03 #1805 → I07 #1893.
- **D:** D08 #1826 → I06 #1892, E11 #1843. D13 #1831 → E02 #1834, E09 #1841, J05 #1901.
- **E:** E02 #1834 → H05 #1875, I09 #1895. E03 #1835 → E05 #1837, E07 #1839, E14 #1846.
- **F:** F01 #1847 → F03 #1849, F05 #1851, F09 #1855, F12 #1858. F14 #1860 → H02 #1872, G10 #1870.
- **G:** G01 #1861 → G03 #1863, G05 #1865, G07 #1867, G10 #1870, I04 #1890.
  G04 #1864 → G06 #1866, G08 #1868, I09 #1895.
- **H:** H01 #1871 → H04 #1874, H06 #1876. A09 #1789 → H03 #1873.
- **I:** I02 #1888 → I06 #1892. I08 #1894 → I09 #1895, J01 #1897, J06 #1902.
- **J:** J01 #1897 → J06 #1902. J05 #1901 → J06 #1902 (supported-versions table).

## Do not combine

These are the PR Guideline rules from the issues, stated once:

- **One issue per PR.** Even when two issues touch the same file, land them
  separately; mention the other issue in the PR body.
- **Issues that say "stacked PRs"** (e.g. tenancy #1894, OIDC #1893) land as a
  stack: ADR first, then model → enforcement → migration → UI, each its own PR.
- **Never mix Rust engine and web changes** in one PR unless the issue's
  "Affected File" list names both. Schema changes go engine-first, then web.
- **Taxonomy / signature changes** (`taxonomy.rs`, `signature_hash.rs`) are
  their own PR with intentionally updated snapshots — never a side effect.
- **Lockfile and `package.json` changes** follow
  [CONTRIBUTING.md](../../CONTRIBUTING.md#lockfile-policy) — separate PR, maintainer approval.
- **Workflow changes** do not ride along with feature work; new actions are
  pinned to a 40-character SHA (`action-pins.yml`).
- **Maintainer-only actions** (repository settings, secrets, signing keys,
  production infra) are flagged in the PR as blocked items — never assumed done.

## Labels legend

| Label | Meaning for you |
|---|---|
| `severity:critical` | Correctness or security foundation: getting it wrong gives wrong results or exposes users, and other issues build on it. Usually `priority:p0`. Expect a thorough review and adversarial tests. |
| `severity:hard` | Substantial, important work that is not a hazard if it waits. Usually `priority:p1`. |
| `complexity:high` / `medium` / `trivial` | Size of the change (scope), set at triage. Every issue in this batch is `complexity:high`: plan on a design note in the PR before code. |
| `area:*` | Which subsystem — see [LABEL_TAXONOMY.md](../LABEL_TAXONOMY.md). |
| `Stellar Wave` | Part of the Stellar Wave program; Wave timers in [MAINTAINER_WAVE_PLAYBOOK.md](../../MAINTAINER_WAVE_PLAYBOOK.md) apply. |
| `security` | Security triage; also exempts the issue from the stale bot. |

[LABEL_TAXONOMY.md](../LABEL_TAXONOMY.md) lists `severity:*` as deprecated for
new issues; this batch still carries them, and they mean what is written above.

## Contribution workflow recap

1. **Claim** the issue with a comment; wait for assignment (Wave timers apply).
2. **Branch** from `main`: `issue/<number>-<slug>` per
   [CONTRIBUTING.md](../../CONTRIBUTING.md#branch-naming) (the issues' shorthand
   "Branch `issue-<n>`" means the same thing).
3. **PR title** is a conventional commit — the issue's "Conventional subject"
   line is the title to use. [`semantic-pr.yml`](../../.github/workflows/semantic-pr.yml)
   rejects anything else (lowercase subject, no trailing period).
4. **PR body** from the [template](../../.github/pull_request_template.md):
   `Closes #<n>`, scope, test evidence (paste command output).
5. **"Things to Check (CI Green)"** in each issue is the acceptance list: every
   named workflow must be green and every named test must exist. Items that
   need a maintainer (keys, settings, infra) are listed as blocked in the PR.
6. **Architectural choices** get an ADR first — see
   [when to write an ADR](../adr/README.md#how-to-create-an-adr).

## Issue map (W5 IDs)

### Theme A — Real host execution and RPC (#1781–#1792)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-A01 | [#1781](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1781) | Deploy and invoke real WASM fixtures in the host runner | critical |
| W5-A02 | [#1782](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1782) | Capture authentic host diagnostics: trap location, error code, and budget exhaustion | critical |
| W5-A03 | [#1783](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1783) | Derive authorization frames from real require_auth calls instead of payload inference | critical |
| W5-A04 | [#1784](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1784) | Differential harness: every seed runs on mock and real host, divergence fails CI | critical |
| W5-A05 | [#1785](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1785) | Versioned host/mock parity contract with drift detection | hard |
| W5-A06 | [#1786](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1786) | RPC runner as a first-class execution path with simulation and submission modes | critical |
| W5-A07 | [#1787](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1787) | RPC failure taxonomy: distinguish transport, sequence, resource, and contract faults | hard |
| W5-A08 | [#1788](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1788) | Connection lifecycle hardening: pooling, timeouts, cancellation, and ledger awareness | hard |
| W5-A09 | [#1789](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1789) | Per-seed structured execution traces for replay and triage | hard |
| W5-A10 | [#1790](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1790) | Host function coverage matrix: what campaigns actually exercised | hard |
| W5-A11 | [#1791](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1791) | Per-seed resource sandbox with deterministic kill classification | critical |
| W5-A12 | [#1792](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1792) | Record fee and budget simulation for every seed outcome | hard |

### Theme B — Determinism, persistence and replay (#1793–#1802)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-B01 | [#1793](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1793) | Canonical serialization contract for all persisted snapshots and JSONL lines | critical |
| W5-B02 | [#1794](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1794) | Freeze the mutation stream: PRNG layout stability behind an engine version | hard |
| W5-B03 | [#1795](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1795) | Deterministic virtual clock injected into classification paths | hard |
| W5-B04 | [#1796](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1796) | Crash-consistent checkpointing with atomic swap and fsync ordering | critical |
| W5-B05 | [#1797](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1797) | Resume correctness under worker failure: reclamation without loss or duplication | hard |
| W5-B06 | [#1798](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1798) | Replay bundle schema versioning: tolerant readers, migrations, and old-fixture fixtures | hard |
| W5-B07 | [#1799](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1799) | Cross-platform replay equivalence enforced as a CI matrix | critical |
| W5-B08 | [#1800](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1800) | Environment fingerprint enforcement: refuse or loudly warn on material divergence | hard |
| W5-B09 | [#1801](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1801) | Flaky signature quarantine with statistical threshold | hard |
| W5-B10 | [#1802](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1802) | Corpus integrity: content addressing, corruption detection, and repair policy | hard |

### Theme C — Security hardening (#1803–#1818)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-C01 | [#1803](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1803) | Envelope-encrypt stored secrets with a master key and rotation path | critical |
| W5-C02 | [#1804](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1804) | Token lifecycle: expiry, rotation with overlap, scopes, and revocation audit | critical |
| W5-C03 | [#1805](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1805) | OAuth state binding: HMAC nonce cookies with single-use consumption | critical |
| W5-C04 | [#1806](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1806) | Post-login redirect allowlist for OAuth callback and invite flows | critical |
| W5-C05 | [#1807](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1807) | Server-side session management: rotating signed cookies, logout invalidation, dual timeouts | critical |
| W5-C06 | [#1808](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1808) | Central CSRF defense for every state-changing API route | critical |
| W5-C07 | [#1809](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1809) | SSRF hardening for all outbound fetches with scheme/host/IP policy | critical |
| W5-C08 | [#1810](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1810) | Per-principal rate limiting with identity-bound buckets and 429 semantics | hard |
| W5-C09 | [#1811](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1811) | Artifact ingestion safety: zip-slip, content sniffing, and decompression caps | hard |
| W5-C10 | [#1812](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1812) | Secret redaction pipeline for logs, traces, and artifacts | hard |
| W5-C11 | [#1813](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1813) | Webhook replay protection: timestamp windows, nonce cache, constant-time verify | hard |
| W5-C12 | [#1814](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1814) | Cross-principal RBAC permission matrix tests and audit completeness | hard |
| W5-C13 | [#1815](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1815) | Security header completion with CSP report-only → enforce pipeline | hard |
| W5-C14 | [#1816](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1816) | Supply chain: SBOM, cosign image signing, and provenance attestation | hard |
| W5-C15 | [#1817](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1817) | Deny-by-default route authorization with a declarative capability registry | critical |
| W5-C16 | [#1818](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1818) | Untrusted-input sink audit: seed payloads, XDR, and imports never reach shell/format/eval | critical |

### Theme D — CI quality gates (#1819–#1832)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-D01 | [#1819](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1819) | Restore the lean PR gate: web lint, typecheck, and unit suite on every PR | critical |
| W5-D02 | [#1820](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1820) | Full Playwright suite as a merge gate with sharding and quarantine | critical |
| W5-D03 | [#1821](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1821) | Mutation testing gate on classification and security logic | hard |
| W5-D04 | [#1822](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1822) | Coverage reporting with a ratchet baseline on both stacks | hard |
| W5-D05 | [#1823](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1823) | Visual regression gate for dashboard critical paths | hard |
| W5-D06 | [#1824](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1824) | Accessibility gate: axe-core scans with zero critical violations on core flows | hard |
| W5-D07 | [#1825](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1825) | Flake detection infrastructure with auto-quarantine and expiry | hard |
| W5-D08 | [#1826](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1826) | Nightly health: failure budgets, auto-triage, and zero tolerated red | hard |
| W5-D09 | [#1827](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1827) | PR performance budgets: bundle, route JS, and Lighthouse enforced with ratchet | hard |
| W5-D10 | [#1828](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1828) | Deterministic web build with lockfile drift detection | hard |
| W5-D11 | [#1829](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1829) | Docker image gate: Trivy scan, size budget, multi-arch, and boot smoke test | hard |
| W5-D12 | [#1830](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1830) | Storage driver conformance suite across memory, Redis, and MinIO with fault injection | hard |
| W5-D13 | [#1831](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1831) | Generated OpenAPI from route handlers with breaking-change detection | hard |
| W5-D14 | [#1832](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1832) | CI concurrency, caching, and concurrency-policy hygiene | hard |

### Theme E — Runtime and API reliability (#1833–#1846)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-E01 | [#1833](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1833) | Idempotent run and campaign creation via idempotency keys | critical |
| W5-E02 | [#1834](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1834) | Stable cursor pagination under concurrent inserts with fuzz tests | hard |
| W5-E03 | [#1835](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1835) | Multi-instance safety: distributed leases for sweeps, cancels, and checkpoint compaction | critical |
| W5-E04 | [#1836](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1836) | SSE stream resilience: heartbeats, Last-Event-ID resume, backpressure, and leak cleanup | hard |
| W5-E05 | [#1837](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1837) | Graceful run cancellation: sealed partial results, terminal state, and resume eligibility | hard |
| W5-E06 | [#1838](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1838) | Health snapshot schema v2 with tolerant readers and corrupt-tail recovery | critical |
| W5-E07 | [#1839](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1839) | Lease-based retention redesign with per-artifact-class policies | hard |
| W5-E08 | [#1840](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1840) | Streaming request limits middleware with route-level overrides | hard |
| W5-E09 | [#1841](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1841) | Unified error taxonomy across API routes with machine-readable codes | hard |
| W5-E10 | [#1842](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1842) | Boot-time configuration validation with actionable failure messages | hard |
| W5-E11 | [#1843](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1843) | Storage integrity: checksummed artifacts, corruption detection sweep, and repair path | critical |
| W5-E12 | [#1844](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1844) | Observability baseline: trace-correlated structured logs, RED metrics, and sampling policy | hard |
| W5-E13 | [#1845](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1845) | Run detail data layer: query budget, join elimination, and coherent caching | hard |
| W5-E14 | [#1846](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1846) | Durable scheduled campaigns: misfire, overlap, and execution ledger | hard |

### Theme F — Fuzzing intelligence (#1847–#1860)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-F01 | [#1847](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1847) | Type-directed ScVal/XDR mutator instead of byte-level mutation | critical |
| W5-F02 | [#1848](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1848) | Coverage-guided corpus energy: map host outcomes to seed prioritization | hard |
| W5-F03 | [#1849](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1849) | Reproducer shrinking: delta-debug payloads while preserving signature | hard |
| W5-F04 | [#1850](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1850) | Stateful auth fuzzing: authorization across contract state transitions | hard |
| W5-F05 | [#1851](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1851) | Soroban pitfall seed dictionary: TTL, archival, depth, and metering edges | hard |
| W5-F06 | [#1852](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1852) | Mutator telemetry and dead-mutator detection | hard |
| W5-F07 | [#1853](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1853) | Corpus minimization with coverage-equivalence and provenance | hard |
| W5-F08 | [#1854](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1854) | Differential fuzzing across engine versions with signature diff reports | critical |
| W5-F09 | [#1855](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1855) | Constraint solver for address, muxed, and contract-id neighborhoods | hard |
| W5-F10 | [#1856](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1856) | Cost-aware campaign budgeting with plateau detection | hard |
| W5-F11 | [#1857](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1857) | Portable cross-campaign corpus exchange with merge semantics | hard |
| W5-F12 | [#1858](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1858) | Stateful sequence fuzzing: multi-invocation call chains from one seed | critical |
| W5-F13 | [#1859](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1859) | Metering-edge targeting: seeds engineered at budget exhaustion boundaries | hard |
| W5-F14 | [#1860](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1860) | Failure clustering backend: signature normalization and hierarchical grouping at scale | hard |

### Theme G — Regression, reproducers and signatures (#1861–#1870)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-G01 | [#1861](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1861) | Baseline signature comparison: new / fixed / recurring classification gate | critical |
| W5-G02 | [#1862](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1862) | Rust reproducer export: compiling test snippets from failing bundles | hard |
| W5-G03 | [#1863](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1863) | GitHub Action: one-line regression gate for downstream repositories | hard |
| W5-G04 | [#1864](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1864) | Fixture provenance manifest: cryptographic link seed → run → engine → environment | hard |
| W5-G05 | [#1865](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1865) | Signature schema versioning without silent re-bucketing | hard |
| W5-G06 | [#1866](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1866) | Shrunk-and-original fixture pairing with visual delta metadata | hard |
| W5-G07 | [#1867](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1867) | Regression suite orchestration: grouping, selection, parallelism, and history | hard |
| W5-G08 | [#1868](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1868) | Sensitive bundle encryption with recipient-scoped export | hard |
| W5-G09 | [#1869](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1869) | Cross-language reproducer parity: Rust, TypeScript, and Python emit identical cases | hard |
| W5-G10 | [#1870](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1870) | Auto-file triaged crash clusters as GitHub issues with dedup | hard |

### Theme H — Dashboard UX (#1871–#1886)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-H01 | [#1871](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1871) | Live run streaming architecture: event log, multi-viewer consistency, UI recovery | critical |
| W5-H02 | [#1872](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1872) | Failure cluster view: grouped signatures with exemplars and drill-down | hard |
| W5-H03 | [#1873](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1873) | State change diff view: readable before/after ledger entries from traces | hard |
| W5-H04 | [#1874](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1874) | Campaign timeline scrubber with milestone and failure event markers | hard |
| W5-H05 | [#1875](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1875) | Virtualized runs table: 100k+ rows with stable sort, selection, and a11y | critical |
| W5-H06 | [#1876](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1876) | Replay-from-UI: trigger, stream, and land results linked to the originating crash | hard |
| W5-H07 | [#1877](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1877) | Comparison builder: side-by-side runs with signature delta | hard |
| W5-H08 | [#1878](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1878) | Triage workflow: bulk actions, keyboard-first flow, and persisted queue state | critical |
| W5-H09 | [#1879](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1879) | Global error taxonomy UI: per-route boundaries with recovery actions and report-a-problem | hard |
| W5-H10 | [#1880](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1880) | Capability-driven UI: permission-aware rendering with403 recovery | hard |
| W5-H11 | [#1881](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1881) | Dashboard performance program: RSC payload trimming, route splitting, measurable budgets | hard |
| W5-H12 | [#1882](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1882) | Search at scale: indexed ranking, typo tolerance, and bounded result rendering | hard |
| W5-H13 | [#1883](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1883) | Resource fee insight panel: thresholds, trends, and campaign cost rollups | hard |
| W5-H14 | [#1884](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1884) | Accessibility remediation program: full keyboard paths and screen-reader audit of triage flows | hard |
| W5-H15 | [#1885](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1885) | Data integrity surfacing: degraded storage, corruption, and stale-data states in UI | critical |
| W5-H16 | [#1886](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1886) | Resilient request UX: retry policies, stale-while-revalidate, and complete empty/error/loading states | hard |

### Theme I — Integrations and platform (#1887–#1896)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-I01 | [#1887](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1887) | Transactional outbox webhook delivery with retries, DLQ, and replay controls | critical |
| W5-I02 | [#1888](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1888) | Prometheus metrics package with golden signals, burn-rate alerts, and dashboards as code | hard |
| W5-I03 | [#1889](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1889) | Sentry release pipeline: source maps, release health, and self-host guidance | hard |
| W5-I04 | [#1890](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1890) | CI replay integration: PR/nightly replay of shipped fixtures with results back to the dashboard | hard |
| W5-I05 | [#1891](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1891) | GitHub pull request integration: sticky check summaries with regression deltas | hard |
| W5-I06 | [#1892](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1892) | Alert routing with acknowledgement flows and escalation policies | hard |
| W5-I07 | [#1893](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1893) | External auth hardening: OIDC discovery validation, JWKS rotation, clock-skew tolerance | critical |
| W5-I08 | [#1894](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1894) | Multi-tenant isolation: org/project scoping with enforcement and escape analysis | critical |
| W5-I09 | [#1895](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1895) | Tamper-evident audit log product surface: query, export, and integrity proof | hard |
| W5-I10 | [#1896](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1896) | Reference deployment: hardened docker-compose with TLS, backups, and restore drills | hard |

### Theme J — Operations, docs and governance (#1897–#1904)

| ID | Issue | Title | Severity |
|---|---|---|---|
| W5-J01 | [#1897](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1897) | Threat model v2: RBAC, artifacts, tenancy, and campaign inputs with abuse cases | critical |
| W5-J02 | [#1898](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1898) | Reproducibility guarantees document with cross-platform evidence | hard |
| W5-J03 | [#1899](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1899) | SRE runbook: incident response for the fuzzing service itself | hard |
| W5-J04 | [#1900](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1900) | Backup and restore with tested RPO/RTO and automated verification | hard |
| W5-J05 | [#1901](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1901) | Release engineering: semver policy, changelog automation, signed tags, and upgrade notes | hard |
| W5-J06 | [#1902](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1902) | Security disclosure policy: SECURITY.md, intake SLA, and advisory publishing | hard |
| W5-J07 | [#1903](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1903) | Contributor architecture guide: data-flow diagrams, ADR index, and "where to start" maps | hard |
| W5-J08 | [#1904](https://github.com/SorobanCrashLab/soroban-crashlab/issues/1904) | Capacity and cost model for campaigns: quotas, scheduling windows, and utilization reporting | hard |
