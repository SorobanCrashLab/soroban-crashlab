# Reproducibility Guarantees

This document describes the deterministic guarantees provided by CrashLab, known limitations across environments, and troubleshooting steps for mismatched replay outcomes.

## Deterministic Guarantees

CrashLab is designed to produce identical outputs given identical inputs. The following components are fully deterministic:

### Seed Mutation

The `mutate_seed` function uses a seeded XOR-shift PRNG that produces identical results across all environments:

```rust
// Same seed always produces same mutation
let seed = CaseSeed { id: 42, payload: vec![1, 2, 3, 4] };
let result_a = mutate_seed(&seed);
let result_b = mutate_seed(&seed);
assert_eq!(result_a, result_b);  // Always true
```

**Guarantee**: Given the same `CaseSeed`, mutation output is byte-identical regardless of:
- Operating system (Linux, macOS, Windows)
- CPU architecture (x86_64, aarch64)
- Rust compiler version
- Time of execution

### Signature Hashing

Crash signatures use FNV-1a hashing which is platform-independent:

```rust
let hash_a = compute_signature_hash("runtime-failure", &[1, 2, 3]);
let hash_b = compute_signature_hash("runtime-failure", &[1, 2, 3]);
assert_eq!(hash_a, hash_b);  // Always 0x... (same value)
```

**Guarantee**: Two failures with identical `category` and `payload` bytes produce identical `signature_hash` values, enabling reliable deduplication.

### Failure Classification

Classification rules are pure functions of payload content:

| Condition | Category |
|-----------|----------|
| `payload.is_empty()` | `empty-input` |
| `payload.len() > 64` | `oversized-input` |
| `payload[0]` in `0x00..=0x1F` | `xdr` |
| `payload[0]` in `0x20..=0x5F` | `state` |
| `payload[0]` in `0x60..=0x9F` | `budget` |
| `payload[0]` in `0xA0..=0xFF` | `auth` |

**Guarantee**: Classification depends only on payload bytes, not on execution environment or timing.

### Scheduler Selection

The `WeightedScheduler` uses splitmix64 PRNG for mutator selection:

```rust
let mut rng = 42u64;  // Seed the RNG
let mutator = scheduler.select_mutator(&mut rng);
// Same rng seed + same weights = same mutator selection
```

**Guarantee**: Given identical RNG state and weight configuration, mutator selection order is deterministic across runs.

### Parallel worker partitioning

When splitting a campaign across workers, use `WorkerPartition` and `drive_run_partitioned` from `crashlab-core`: global seed index `i` is assigned to worker `i % num_workers`. Each worker runs only its indices, but the runner still walks the full `0..total_seeds` order for cancellation alignment.

**Guarantee**: Per-seed outputs (classification, signatures, mutation) depend only on the seed index and payload, not on worker count. Merging worker results sorted by global seed index matches a single-worker `drive_run` over the same schedule.

### Checkpoint resume

Persist `RunCheckpoint` as JSON and resume with `drive_run_from_checkpoint` (single worker) or `drive_run_partitioned_from_checkpoint` (per-worker resume). The checkpoint cursor always points at the next global seed index to inspect, and it advances only after the current seed index has been fully accounted for.

**Guarantee**: Restarting from the same checkpoint replays the same remaining seed order without reprocessing seed indices already covered by that checkpoint.

## Known Limitations

### Environment-Dependent Factors

These factors can cause replay divergence across environments:

#### 1. Soroban SDK Version

Contract behavior may differ between SDK versions due to:
- Host function implementation changes
- Budget calculation adjustments
- Authorization model updates

**Recommendation**: Pin `soroban-sdk` version in `Cargo.toml`:
```toml
[dependencies]
soroban-sdk = "=21.0.0"  # Exact version pin
```

#### 2. Ledger State Dependency

Seeds that interact with ledger state may produce different results if:
- Ledger sequence number differs
- Timestamp differs
- Prior contract state differs

**Recommendation**: Use deterministic test fixtures with frozen ledger state.

#### 3. Contract Code Changes

Any modification to the contract under test invalidates prior failure signatures.

**Recommendation**: Track contract commit hash alongside failure artifacts.

### Floating-Point Edge Cases

The scheduler uses `f64` for weight distribution. While selection is deterministic for typical weights, extreme values near floating-point boundaries may exhibit platform-specific rounding:

```rust
// These weights work reliably
let weights = vec![1.0, 2.0, 3.0];

// Avoid extreme ratios
let problematic = vec![1e-300, 1e300];  // May cause precision issues
```

### Thread Ordering

When running multiple seeds in parallel, the order of result collection is non-deterministic. Individual seed results remain deterministic, but aggregated reports may list them in different orders.

**Recommendation**: Sort results by seed ID before comparison.

### Concurrent checkpoint writers

Checkpoint files are not locked. Two workers resuming from the same checkpoint file can overwrite each other's progress and reprocess work.

**Recommendation**: Use one checkpoint file per worker partition and avoid sharing a single checkpoint path across concurrent runners.

## Stability Verification

CrashLab provides built-in tools to verify reproducibility before exporting failures to CI.

### Using FlakyDetector

```rust
use crashlab_core::{to_bundle, CaseSeed};
use crashlab_core::reproducer::FlakyDetector;

// Create a bundle from a failing seed
let bundle = to_bundle(CaseSeed { id: 1, payload: vec![0xA0, 0x01] });

// Configure stability check: 10 runs, max 5% flake rate
let detector = FlakyDetector::new(10, 0.05);

// Run stability check (replace with actual contract invocation)
let report = detector.check(&bundle, |seed| {
    invoke_contract_under_test(seed)
});

if report.is_stable {
    println!("Seed is stable for CI export");
} else {
    println!("Flake rate: {:.1}% - quarantine this seed", report.flake_rate * 100.0);
}
```

### Filtering CI Packs

```rust
use crashlab_core::reproducer::{FlakyDetector, filter_ci_pack};

let bundles: Vec<CaseBundle> = collect_failure_bundles();
let detector = FlakyDetector::new(5, 0.0);  // Zero tolerance for CI

let stable_pack = filter_ci_pack(&bundles, &detector, |seed| {
    invoke_contract_under_test(seed)
});

// Only stable_pack seeds go into CI regression suite
export_to_ci(stable_pack);
```

### Grouped regression suites

`crashlab_core::export_rust_regression_suite` places each fixture into a submodule named from **domain risk** (`FailureClass` from `classify_failure` on the bundle seed) and **expected failure mode** (`bundle.signature.category`). That lets you run slices of the suite independently:

```bash
# All regression tests under the generated root module
cargo test my_contract_regression

# Only the auth + runtime-failure bucket
cargo test my_contract_regression::regression_auth_runtime_failure
```

Use `crashlab_core::group_bundles_by_regression_group` or `regression_group_module_ident` if you need the same grouping in tooling without emitting Rust source.

## Troubleshooting Mismatched Replays

### Symptom: Signature Mismatch on Replay

**Cause 1: Contract code changed**
```
Expected: signature_hash = 0xABCD1234
Got:      signature_hash = 0xDEAD5678
```

**Fix**: Verify contract source matches the version that generated the original failure:
```bash
# Check contract commit hash
git log --oneline contracts/crashlab-core/src/lib.rs | head -1

# Compare with stored failure metadata
cat failures/seed-42.json | jq '.contract_commit'
```

**Cause 2: Soroban SDK version mismatch**
```
Original:  soroban-sdk 20.5.0
Current:   soroban-sdk 21.0.0
```

**Fix**: Pin SDK version to match original failure environment:
```bash
# In Cargo.toml
cargo update -p soroban-sdk --precise 20.5.0
```

**Cause 3: Non-deterministic contract logic**

Some contracts use ledger timestamp or sequence number:
```rust
// This is non-deterministic across replays
let now = env.ledger().timestamp();
if now % 2 == 0 { ... }
```

**Fix**: Mock ledger state in test harness or refactor contract to accept time as parameter.

### Symptom: Intermittent Flaky Results

**Diagnosis**: Run `FlakyDetector` with high iteration count:
```rust
let detector = FlakyDetector::new(100, 0.0);
let report = detector.check(&bundle, reproducer);

println!("Flake rate over 100 runs: {:.1}%", report.flake_rate * 100.0);
```

**Common causes**:
1. **Uninitialized memory** — Contract reads from storage keys that don't exist
2. **Race conditions** — Parallel test execution corrupts shared state
3. **Resource exhaustion** — Budget limits hit intermittently under load

**Fix**: Isolate the contract in a fresh environment per test:
```rust
// Bad: shared state
static GLOBAL_ENV: Env = ...;

// Good: per-test isolation
fn test_case() {
    let env = Env::default();
    // ...
}
```

### Symptom: Different Results Across Machines

**Diagnosis checklist**:

| Factor | Check Command |
|--------|---------------|
| Rust version | `rustc --version` |
| Soroban SDK | `cargo tree -p soroban-sdk` |
| Target arch | `rustc -vV \| grep host` |
| Endianness | Should be identical on modern systems |

**Fix**: Use CI as the canonical replay environment:
```yaml
# .github/workflows/replay.yml
jobs:
  replay:
    runs-on: ubuntu-latest
    steps:
      - uses: dtolnay/rust-toolchain@1.75.0
      - run: cargo test --package crashlab-core -- replay_
```

### Symptom: Classification Differs

If `FailureClass` differs between runs:

**Check payload integrity**:
```rust
// Payload bytes must be byte-identical
println!("Original payload: {:02x?}", original.payload);
println!("Replay payload:   {:02x?}", replay.payload);
```

**Check payload length**:
```rust
// 64-byte boundary matters
assert!(payload.len() <= 64);  // Otherwise: oversized-input
```

## Best Practices

### 1. Version Lock Everything

```toml
# Cargo.toml
[dependencies]
soroban-sdk = "=21.0.0"

[dev-dependencies]
crashlab-core = "=0.1.0"
```

### 2. Store Failure Metadata

```json
{
  "seed_id": 42,
  "payload_hex": "a00102030405",
  "signature_hash": "0x1234567890abcdef",
  "contract_commit": "abc123",
  "sdk_version": "21.0.0",
  "rust_version": "1.75.0",
  "recorded_at": "2024-03-15T10:30:00Z"
}
```

### 3. Validate Before CI Export

```rust
// Always run stability check before adding to regression suite
let detector = FlakyDetector::new(10, 0.0);
for bundle in new_failures {
    let report = detector.check(&bundle, reproducer);
    if !report.is_stable {
        log::warn!("Quarantining flaky seed {}", bundle.seed.id);
        continue;
    }
    export_to_ci(bundle);
}
```

### 4. Sanitize Public Fixtures

When a fixture needs to be attached to a public issue or shared outside the
trusted team boundary, export it through the sanitization helpers instead of the
raw JSON writers:

```rust
use crashlab_core::{
    export_sanitized_scenario_json, save_sanitized_case_bundle_json,
};

let public_bundle_json = save_sanitized_case_bundle_json(&bundle)?;
let public_scenario_json = export_sanitized_scenario_json(&bundle, "public")?;
```

These helpers preserve payload length and failure class while redacting
secret-like fragments such as bearer tokens, cookies, and password-style key
value pairs from exported fixture payloads.

### 5. Use Reproducible CI Environment

```dockerfile
FROM rust:1.75-slim
RUN rustup target add wasm32-unknown-unknown
COPY . /app
WORKDIR /app
RUN cargo build --release
```

## Summary

| Component | Deterministic? | Caveats |
|-----------|---------------|---------|
| `mutate_seed` | Yes | None |
| `classify` | Yes | None |
| `compute_signature_hash` | Yes | None |
| `WeightedScheduler` | Yes | Avoid extreme weight ratios |
| Contract invocation | Depends | SDK version, ledger state, contract code |
| Parallel execution order | No | Sort results by seed ID |

For reliable reproducibility:
1. Pin all dependency versions
2. Use `FlakyDetector` to validate stability
3. Store complete metadata with failure artifacts
4. Use consistent CI environment for canonical replays
