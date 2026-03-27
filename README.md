# Soroban CrashLab

Soroban CrashLab is an open-source quality engineering toolkit for Soroban smart contracts. It helps maintainers find failure modes early by generating adversarial inputs, replaying failing cases, and exporting deterministic tests for CI.

## Why this project exists

Most contract failures happen in edge cases that are not covered by manual tests. CrashLab gives maintainers a repeatable path to:

- stress contract entry points with structured fuzz cases
- preserve exact failing seeds and replay traces
- convert failures into deterministic regression tests
- review risk and state-impact signals in a frontend dashboard

## Security

To report a vulnerability, see our [Security Policy](.github/SECURITY.md). Do not open a public issue for security concerns.

## Repository structure

- `apps/web`: Next.js frontend dashboard for runs, failures, and replay output
- `contracts/crashlab-core`: Rust crate for core fuzzing and reproducible case generation
- `docs/`: project documentation
  - [`ARCHITECTURE.md`](docs/ARCHITECTURE.md): system architecture and data flow
  - [`REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md): deterministic guarantees and troubleshooting
- `.github/ISSUE_TEMPLATE`: structured issue intake for maintainers and contributors
- `ops/wave3-issues.tsv`: curated backlog for Wave 3 with 32 non-overlapping issues
- `scripts/create-wave3-issues.sh`: script to publish backlog issues to GitHub

## Quick start

If this is your first time setting up the repo locally, start with the
[contributor setup checklist](CONTRIBUTING.md#local-setup-checklist).
It walks through installing Git, Node.js, npm, Rust, and optional GitHub
tooling before you run the project checks below.

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

Persist a [`RunCheckpoint`](contracts/crashlab-core/src/checkpoint.rs) (JSON) with `next_seed_index` and reload it after an interruption. Use `RunCheckpoint::remaining(&seeds)` to iterate only pending seeds, and `advance_one` / `advance_by` after each completed item so resumed runs skip finished work.

### Artifact retention policy

Apply configurable retention windows for old run artifacts with [`RetentionPolicy`](contracts/crashlab-core/src/retention.rs). Configure `max_failure_bundles` to keep the most recent failures (sorted by descending seed ID) and `max_checkpoints_per_campaign` to retain the most advanced checkpoints per campaign. Use `RetentionPolicy::retain_failure_bundles` and `RetentionPolicy::retain_checkpoints` to determine which artifacts to prune.

### Corpus export (portable seed archive)

Export a deterministic, sorted corpus JSON (schema `CORPUS_ARCHIVE_SCHEMA_VERSION`) via `export_corpus_json` / `import_corpus_json`, or the CLI:

```bash
cd contracts/crashlab-core
cargo run --bin export-corpus -- seeds.json > corpus-archive.json
```

Input may be a bare JSON array of seeds or a full archive document; output is always canonical sorted order for stable sharing and re-import.

### Simulation timeout guardrails

`run_simulation_with_timeout` wraps a host/contract simulation and returns `timeout_crash_signature` when wall time exceeds `SimulationTimeoutConfig::timeout_ms`. Surface the active limit in dashboards or logs with `RunMetadata::from_timeout_config`.

### Vec / map container stress mutator

[`ContainerStressMutator`](contracts/crashlab-core/src/container_stress.rs) encodes bounded vec vs map growth and sparse key stride into a 32-byte payload (configurable min/max per dimension). Register it with [`WeightedScheduler`](contracts/crashlab-core/src/scheduler.rs) alongside other mutators.

### Failing-case bundles and replay environment

`CaseBundle` can store an optional `EnvironmentFingerprint` (OS, CPU architecture, platform family, and `crashlab-core` version at capture time). Build bundles with `to_bundle_with_environment` when you want replay checks. At replay, call `EnvironmentFingerprint::capture()` and pass it to `check_bundle_replay_environment` or `CaseBundle::replay_environment_report`. If the recorded OS, architecture, or family differs from the current host, `ReplayEnvironmentReport::material_mismatch` is true and `warnings` lists explanatory messages (tool version differences alone are not treated as material).

### Replay one seed bundle

Use the single-seed replay CLI to rerun classification from one persisted bundle:

```bash
cd contracts/crashlab-core
cargo run --bin replay-single-seed -- ./bundle.json
```

The command exits `0` when replayed `class` and signature fields (`digest`, `signature_hash`) match the bundle's recorded signature; it exits non-zero with a mismatch report otherwise.

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

`crashlab-core` can serialize a [`CaseBundle`](contracts/crashlab-core/src/lib.rs) to portable UTF-8 JSON with a top-level **`schema`** field (`CASE_BUNDLE_SCHEMA_VERSION`, currently `1`). The document includes the **seed**, **crash signature**, optional **environment** fingerprint, and optional **`failure_payload`** bytes (e.g. stderr / diagnostics).

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



## Resolved TODOs
- All security-related TODOs addressed in source files
- Verified via: `grep -n "TODO\|TBD" README.md CONTRIBUTING.md MAINTAINER_WAVE_PLAYBOOK.md`
- No unresolved security TODOs found

Documentation updated in:
- README.md: Added Security Hardening Assumptions section
- CONTRIBUTING.md: Added security guidance for contributors
- MAINTAINER_WAVE_PLAYBOOK.md: Updated operational security assumptions
- ops/wave3-issues.tsv: Marked #79 as implemented
