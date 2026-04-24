# Soroban CrashLab

Soroban CrashLab is an open-source quality engineering toolkit for Soroban smart contracts. It helps maintainers find failure modes early by generating adversarial inputs, replaying failing cases, and exporting deterministic tests for CI.

## Why this project exists

Most contract failures happen in edge cases that are not covered by manual tests. CrashLab gives maintainers a repeatable path to:

- stress contract entry points with structured fuzz cases
- preserve exact failing seeds and replay traces
- convert failures into deterministic regression tests
- review risk and state-impact signals in a frontend dashboard

## Security

To report a vulnerability, see our [Security Policy](.github/SECURITY.md). Do not open a public issue for security concerns. Maintainer conflict-of-interest handling for security triage, assignment, review, and disclosure decisions is defined in the same policy.

## Repository structure

- `apps/web`: Next.js frontend dashboard for runs, failures, and replay output
- `contracts/crashlab-core`: Rust crate for core fuzzing and reproducible case generation (`WorkerPartition` / `drive_run_partitioned` split seed indices across workers deterministically; see `docs/REPRODUCIBILITY.md`)
- `docs/`: project documentation
  - [`ARCHITECTURE.md`](docs/ARCHITECTURE.md): system architecture and data flow
  - [`REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md): deterministic guarantees and troubleshooting
  - [`RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md): maintainer checklist for tagging releases, updating the changelog, and reviewing backward compatibility
- `.github/ISSUE_TEMPLATE`: structured issue intake for maintainers and contributors
- `ops/wave3-issues.tsv`: curated backlog for Wave 3 with 32 non-overlapping issues
- `scripts/create-wave3-issues.sh`: script to publish backlog issues to GitHub

## Quick start

If this is your first time setting up the repo locally, start with the
[contributor setup checklist](CONTRIBUTING.md#local-setup-checklist).
It walks through installing Git, Node.js, npm, Rust, and optional GitHub
tooling before you run the project checks below.
If setup, build, test, or replay commands fail locally, jump to the
[contributor debugging playbook](CONTRIBUTING.md#contributor-debugging-playbook).

### Prerequisites

- Git
- Node.js 22+
- npm 10+ (the npm version bundled with Node.js 22 is fine)
- Rust stable + Cargo
- Optional: GitHub CLI (`gh`) authenticated for Wave maintenance scripts

### Verify your toolchain

```bash
git --version
node -v
npm -v
rustc -V
cargo -V
gh --version # optional
```

### Install web dependencies and run web checks

```bash
cd apps/web
npm ci
npm run test
npm run lint
npm run build
npm run dev
```

### Build and test core crate

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

### Run checkpoints (resume without redoing work)

Persist a [`RunCheckpoint`](contracts/crashlab-core/src/checkpoint.rs) (JSON) with `next_seed_index` and reload it after an interruption. Use `drive_run_from_checkpoint` to resume a single-worker campaign from the first unfinished seed without replaying completed work.

For multi-worker runs, keep a separate checkpoint file per worker and resume with `drive_run_partitioned_from_checkpoint`. Each worker checkpoint stores the next global seed index that worker should inspect, so unowned indices are skipped once and not rescanned after restart.

### Artifact retention policy

Apply configurable retention windows for old run artifacts with [`RetentionPolicy`](contracts/crashlab-core/src/retention.rs). Count-based helpers remain available through `retain_failure_bundles` and `retain_checkpoints`, while time-aware pruning uses `RetentionRecord<T>` plus:

- `retain_failure_bundle_records`: keeps the newest failures pinned via `keep_latest_failures`, then prunes older failures outside `failure_retention_window`.
- `retain_checkpoint_records`: keeps each campaign's most advanced checkpoints and any checkpoints still inside `checkpoint_retention_window`.

This lets maintainers preserve the latest failure evidence while pruning old non-critical artifacts deterministically.

### Corpus export (portable seed archive)

Export a deterministic, sorted corpus JSON (schema `CORPUS_ARCHIVE_SCHEMA_VERSION`) via `export_corpus_json` / `import_corpus_json`, or the CLI:

```bash
cd contracts/crashlab-core
cargo run --bin export-corpus -- seeds.json > corpus-archive.json
```

Input may be a bare JSON array of seeds or a full archive document; output is always canonical sorted order for stable sharing and re-import.

### Simulation timeout guardrails

`run_simulation_with_timeout` wraps a host/contract simulation and returns `timeout_crash_signature` when wall time exceeds `SimulationTimeoutConfig::timeout_ms`. Surface the active limit in dashboards or logs with `RunMetadata::from_timeout_config`.

Run metadata JSON is versioned (`schema` / `RUN_METADATA_SCHEMA_VERSION`). Persist with `save_run_metadata_json` and reload with `load_run_metadata_json` so documents without a `schema` field (older writes) are accepted and normalized to the current format without losing `simulation_timeout_ms`.

### Vec / map container stress mutator

[`ContainerStressMutator`](contracts/crashlab-core/src/container_stress.rs) encodes bounded vec vs map growth and sparse key stride into a 32-byte payload (configurable min/max per dimension). Register it with [`WeightedScheduler`](contracts/crashlab-core/src/scheduler.rs) alongside other mutators.

### Failing-case bundles and replay environment

`CaseBundle` can store an optional `EnvironmentFingerprint` (OS, CPU architecture, platform family, and `crashlab-core` version at capture time). Build bundles with `to_bundle_with_environment` when you want replay checks. At replay, call `EnvironmentFingerprint::capture()` and pass it to `check_bundle_replay_environment` or `CaseBundle::replay_environment_report`. If the recorded OS, architecture, or family differs from the current host, `ReplayEnvironmentReport::material_mismatch` is true and `warnings` lists explanatory messages (tool version differences alone are not treated as material).

### Replay one seed bundle

Use either replay CLI to rerun one persisted bundle end to end:

```bash
cd contracts/crashlab-core
cargo run --bin replay-single-seed -- ./bundle.json
cargo run --bin crashlab -- replay seed ./bundle.json
```

Replay reports both the stable taxonomy class (`auth`, `budget`, `state`, `xdr`, etc.) and the persisted signature fields (`category`, `digest`, `signature_hash`). The command exits `0` only when both the class and signature match the recorded bundle; it exits non-zero with a mismatch report otherwise.

Legacy bundles that still store `signature.category = "runtime-failure"` remain replayable: the stable class is derived from the bundle seed so results stay reproducible across reruns.

### Failure classification taxonomy

CrashLab separates the stable failure class from the persisted crash signature:

- `classify_failure(&seed)` maps bundle seeds into stable classes such as `auth`, `budget`, `state`, and `xdr`.
- `stable_failure_class_for_bundle(&seed, &signature)` preserves backward compatibility by deriving a stable class from legacy `"runtime-failure"` signatures during replay.
- `signature.category` remains unchanged in stored bundles, so older artifacts continue to round-trip through bundle persistence and replay.

This keeps classification deterministic for dashboards and triage without breaking existing artifacts.

### Stale run detection

[`StaleRunDetector`](contracts/crashlab-core/src/stale_detector.rs) marks a run as stale when progress has not advanced within `StaleDetectorConfig::stale_threshold_ms`. Use `check()` during live runs or `check_with_elapsed()` in deterministic tests and health checks. `StaleStatus::Stale` includes both the elapsed stale duration and a recovery hint for operators.

### Transient RPC Retry Strategy

`crashlab-core` implements a bounded retry strategy with exponential backoff and jitter for simulation and reproduction calls that fail due to transient network or RPC errors.

#### Error Classification

Simulation and reproduction calls (via `run_matrix`, `FlakyDetector::check`, or `filter_ci_pack`) must return a `Result<CrashSignature, SimulationError>`.

*   **`SimulationError::Transient`**: Safe to retry (e.g., HTTP 429 Rate Limit, HTTP 503 Service Unavailable, connection timeouts).
*   **`SimulationError::NonTransient`**: Immediate failure (e.g., HTTP 400 Bad Request, contract traps, logical invariants).

#### Configuration

The default retry configuration is:

*   **Max Attempts**: 5 (initial call + 4 retries)
*   **Initial Backoff**: 100ms
*   **Max Backoff**: 10 seconds
*   **Backoff Algorithm**: Exponential (`2^(attempt-1)`) with randomized jitter (0.5x to 1.5x of base backoff).

#### Determinism in Tests

The implementation integrates with `SeededPrng` to ensure jitter is deterministic and reproducible during tests when a seed is provided.

Expected bundle JSON shape:

```json
{
  "seed": { "id": 42, "payload": [1, 2, 3] },
  "signature": {
    "category": "runtime-failure",
    "digest": 123,
    "signature_hash": 456
  },
  "environment": null
}
```

### Persist failing case bundles (JSON, versioned)

`crashlab-core` can serialize a [`CaseBundle`](contracts/crashlab-core/src/lib.rs) to portable UTF-8 JSON with a top-level **`schema`** field (`CASE_BUNDLE_SCHEMA_VERSION`, currently `2`). The document includes the **seed**, **crash signature**, optional **environment** fingerprint, optional **`failure_payload`** bytes (e.g. stderr / diagnostics), and optional **`rpc_envelope`** capture for replay auditing.

```rust
use crashlab_core::{load_case_bundle_json, save_case_bundle_json, to_bundle, CaseSeed};

let bundle = to_bundle(CaseSeed { id: 1, payload: vec![1, 2, 3] });
let bytes = save_case_bundle_json(&bundle).expect("serialize");
let roundtrip = load_case_bundle_json(&bytes).expect("deserialize");
assert_eq!(roundtrip.seed, bundle.seed);
```

See [`contracts/crashlab-core/src/bundle_persist.rs`](contracts/crashlab-core/src/bundle_persist.rs) for `read_case_bundle_json` / `write_case_bundle_json` and error types.

### Publish curated Wave 3 issues

```bash
chmod +x scripts/create-wave3-issues.sh
./scripts/create-wave3-issues.sh
```

## Maintainer workflow for Drips Wave

1. Keep issue acceptance criteria explicit and testable.
2. Assign contributor quickly during active wave windows.
3. Review PRs with reproducibility and safety as first checks.
4. Mark issues resolved before wave cutoff when quality is acceptable.
5. Leave post-resolution review feedback to strengthen contributor trust.

For release tagging, changelog upkeep, and compatibility review, follow the
[release process guide](docs/RELEASE_PROCESS.md).

## Security Hardening Assumptions
### Fuzz Input Handling
- **Trust Model**: All fuzz input is considered fully adversarial. The library does not trust any external data.
- **Trust Boundaries**: The primary entry point for fuzz input is the `CaseSeed` struct (defined in `lib.rs`). Any code that constructs a `CaseSeed` from external sources (e.g., file, network, generator) is responsible for validating it before use.
- **Mitigation Controls**:
  - The `SeedSchema` (in `seed_validator.rs`) provides configurable validation for payload length (default 1–64 bytes) and seed ID bounds. Integrators should call `validate` before using a seed.
  - Validation errors are returned as a list of `SeedValidationError`, allowing the integrator to reject malformed seeds without panicking.
- **Known Gaps**:
  - **Null-byte handling**: The validator does not check for null bytes (`0x00`) in the payload. Contracts that interpret payloads as C-style strings may be vulnerable to truncation or injection. This is a known gap; integrators may need to add additional checks if their contract expects non-null bytes.
  - **Automatic enforcement**: The library does not automatically reject invalid seeds; it's the integrator's responsibility to validate. If validation is skipped, subsequent operations may panic (e.g., oversized payloads could cause allocation failures).
- **Failure Mode**: When validation fails, the `validate` method returns `Err`. Integrators should treat this as a non-execution case and log/record the error. The library itself does not panic on validation errors.

### Artifact Storage
- **Trust Model**: Artifact storage (writing crash inputs, corpus entries, coverage data) is outside the library's scope. However, the library provides utilities that can be used safely. Filenames and paths derived from fuzz input must be considered untrusted and sanitized to prevent path traversal or injection.
- **Trust Boundaries**: The integrator's artifact storage implementation is the trust boundary. If filenames are constructed from raw seed payloads, IDs, or other attacker-controlled data, they could contain path separators or special characters.
- **Mitigation Controls**:
  - The `compute_signature_hash` function (in `lib.rs`) produces a deterministic 64-bit FNV-1a hash from a category string and payload. This hash can be used as a safe filename because it contains only hexadecimal digits (or raw bytes) and no path separators.
  - The `FailureClass::as_str` method returns static, filesystem-safe strings (e.g., `"auth"`, `"budget"`) that can be used as directory names without additional sanitization.
- **Known Gaps**:
  - **No built-in path traversal protection**: The library does not provide a function to sanitize arbitrary strings for use as filenames. Integrators must implement their own sanitization if they use any untrusted data in paths.
  - **No file permission management**: The library does not set permissions on written artifacts. Integrators are responsible for setting appropriate permissions (e.g., `0o644` for files, `0o755` for directories) based on their security and reproducibility requirements.
  - **Storage exhaustion**: The library does not handle disk full or quota errors; these must be caught by the integrator's I/O layer.
- **Recommendations**: Use the signature hash as the primary artifact identifier. Store artifacts in a dedicated directory with restrictive permissions (e.g., `0o700`) to prevent unauthorized access. Validate available disk space before large writes.



## Resolved Maintenance Notes
- All previously tracked security placeholders have been addressed in source files.
- Current security-process validation is covered by the maintainer policy checks in `apps/web`.

Documentation updated in:
- README.md: Added Security Hardening Assumptions section
- CONTRIBUTING.md: Added security guidance for contributors
- MAINTAINER_WAVE_PLAYBOOK.md: Updated operational security assumptions
- ops/wave3-issues.tsv: Marked #79 as implemented
