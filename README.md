# Soroban CrashLab

Soroban CrashLab is an open-source quality engineering toolkit for Soroban smart contracts. It helps maintainers find failure modes early by generating adversarial inputs, replaying failing cases, and exporting deterministic tests for CI.

## Why this project exists

Most contract failures happen in edge cases that are not covered by manual tests. CrashLab gives maintainers a repeatable path to:

- stress contract entry points with structured fuzz cases
- preserve exact failing seeds and replay traces
- convert failures into deterministic regression tests
- review risk and state-impact signals in a frontend dashboard

## Repository structure

- `apps/web`: Next.js frontend dashboard for runs, failures, and replay output
- `contracts/crashlab-core`: Rust crate for core fuzzing and reproducible case generation
- `.github/ISSUE_TEMPLATE`: structured issue intake for maintainers and contributors
- `ops/wave3-issues.tsv`: curated backlog for Wave 3 with 32 non-overlapping issues
- `scripts/create-wave3-issues.sh`: script to publish backlog issues to GitHub

## Quick start

### Prerequisites

- Node.js 22+
- npm 9+
- Rust stable + Cargo
- GitHub CLI (`gh`) authenticated for issue publishing

### Install and run frontend

```bash
cd apps/web
npm install
npm run dev
```

### Build and test core crate

```bash
cd contracts/crashlab-core
cargo test
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

See `MAINTAINER_WAVE_PLAYBOOK.md` for operational details.
