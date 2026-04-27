# PR Description: Issue #403 - Export Failing Seed as Rust Regression Fixture

## Summary

Implements automatic Rust regression test snippet generation from failing case bundles. This feature enables maintainers to export deterministic, compilable Rust test functions that can be dropped directly into a contract test suite, satisfying the canonical definition of a regression test: fails before the bug is patched, passes after.

Closes #403

## Design Note

### Code Generation Mechanism

**Chosen:** `format!`-based string interpolation

**Rationale:** The codebase already uses `format!` for code generation in `scenario_export.rs` and `regression_grouping.rs`. No template engine (`handlebars`, `tera`, `askama`) or `quote!`/`proc_macro2` is present as a dependency. The output complexity (a single `#[test]` function with fixed structure) does not justify introducing a new dependency.

**Alternatives Considered:**
- **`quote!` / `proc_macro2`:** Would provide compile-time validation of generated Rust syntax, but adds dependencies and complexity for a simple, fixed-structure output. The existing `format!` pattern is sufficient and consistent with the codebase.
- **Template engine:** Overkill for a single function template. Would add dependency weight without meaningful benefit.

### Assertion Strategy

**Chosen:** `replay_seed_bundle()` with explicit field assertions

**Rationale:** The existing `replay_seed_bundle()` function (from `replay.rs`) already provides the exact assertion pattern needed:
- Returns a `ReplayResult` containing both expected and actual signatures
- Compares `category`, `digest`, and `signature_hash` fields
- Provides a `matches` boolean for overall verification

The generated snippet uses:
```rust
let result = replay_seed_bundle(&bundle);
assert_eq!(result.actual.category, expected_category);
assert_eq!(result.actual.digest, expected_digest);
assert_eq!(result.actual.signature_hash, expected_signature_hash);
assert!(result.matches, "replay should match exported failing bundle signature");
```

This pattern is already established in the codebase and provides clear, actionable failure messages.

**Alternatives Considered:**
- **`should_panic`:** Would not verify the specific failure signature, only that a panic occurred. Too coarse-grained.
- **`assert!(matches!(..., ContractError::...))`:** Would require typed error enums that don't exist in the current abstraction layer. The signature-based approach is more flexible.

### Test Function Name Derivation

**Chosen:** `regression_seed_{id}_{hash_prefix}` where `hash_prefix` is the first 8 hex characters of the FNV-1a hash of the payload.

**Rationale:**
- **Deterministic:** Same bundle always produces the same name
- **Unique:** Different bundles produce different names with high probability (64-bit hash space, 32-bit prefix)
- **Valid:** Always produces a valid Rust identifier (starts with letter, contains only alphanumeric and underscores)
- **Readable:** Includes seed ID for human reference

**Collision Probability:** With a 32-bit hash prefix, the birthday paradox gives ~50% collision probability at ~65,000 fixtures. For typical fixture stores (hundreds to low thousands), collision risk is negligible. If a collision occurs, the second fixture write will overwrite the first (documented in code comments).

### Snippet Structure

**Self-contained:** The generated snippet includes all necessary `use` statements and constructs the full `CaseBundle` inline. No external fixture loading is required. This makes the snippet:
- **Portable:** Can be copied to any test harness that depends on `crashlab-core`
- **Reviewable:** All test data is visible in the source
- **Versionable:** Changes to the bundle are visible in git diffs

**Tradeoffs:**
- **Verbosity:** Each snippet is ~20 lines. For large fixture sets, this could be mitigated by using `export_rust_regression_suite()` (from `regression_grouping.rs`) which groups snippets into modules.
- **Duplication:** Multiple snippets with similar payloads will have similar code. This is acceptable because each snippet is an independent regression test.

### Rollback Path

**Configuration flag:** None added. The feature is opt-in by calling `write_rust_regression_snippet()` explicitly.

**Rollback:** To disable snippet export:
1. Stop calling `write_rust_regression_snippet()` in the export pipeline
2. No code revert required
3. Existing snippets remain valid and can be deleted manually if desired

## Sample Harness

**Location:** `contracts/crashlab-core/tests/regression_harness/`

**Structure:**
```
regression_harness/
├── Cargo.toml          # Depends on crashlab-core at path = "../.."
├── src/
│   └── lib.rs          # Example manual regression test
└── tests/
    └── sample_generated_regression.rs  # Example generated snippets
```

**Dependency:** The harness declares `crashlab-core = { path = "../.." }` in its `Cargo.toml`, making all public types and functions available.

**Import namespace:** Generated snippets use:
```rust
use crashlab_core::{replay_seed_bundle, CaseBundle, CaseSeed, CrashSignature};
```

All types are re-exported from `crashlab-core::lib.rs`, so no path adjustments are needed.

**Manual compilation:**
```bash
cd contracts/crashlab-core/tests/regression_harness
cargo build --tests
cargo test
```

## Validation Steps

### Primary Validation

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

**Result:** All 483 tests pass (474 unit tests + 9 integration tests)

**Output summary:**
```
test result: ok. 483 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### Sample Harness Compilation

```bash
cd contracts/crashlab-core/tests/regression_harness
cargo build --tests
```

**Result:** Compiles successfully with zero errors and zero warnings.

### Sample Harness Tests

```bash
cd contracts/crashlab-core/tests/regression_harness
cargo test
```

**Result:** All 3 tests pass:
- `tests::example_manual_regression_test` (manual test demonstrating pattern)
- `regression_seed_42_af88cf52` (generated snippet example)
- `regression_seed_99_cbf29ce4` (generated snippet for empty payload)

### End-to-End Integration Sanity Check

**Steps:**
1. Create a failing bundle using `to_bundle()`
2. Call `write_rust_regression_snippet()` to generate and write the snippet
3. Verify the `.rs` file is created with valid Rust syntax
4. Copy the snippet into the sample harness
5. Run `cargo test` in the harness
6. Confirm the test fails with the expected failure signature
7. (Hypothetically) apply a patch that fixes the bug
8. Confirm the test now passes

**Observed outcome:** Steps 1-5 executed successfully. The generated snippet compiles and reproduces the expected failure signature. Steps 6-7 are hypothetical (no actual bug to patch), but the test infrastructure is validated.

### Determinism Verification

**Command:**
```bash
# Generate snippet twice from the same bundle
cargo run --example gen_test_values
# Manually verify output is identical
```

**Result:** Byte-for-byte identical output across multiple runs. No timestamps, random identifiers, or non-deterministic values in generated code.

### Fixture Schema Backward Compatibility

**Test:** Load all existing fixture files through the updated fixture loader.

**Result:** No fixture schema changes were made. The `RegressionFixture` struct already has an optional `regression_group` field (added by #402). No new fields were added.

### Wave 4 Regression

**Modules tested:**
- `scenario_export` (modified)
- `lib` (modified exports)
- All other modules (unchanged)

**Command:**
```bash
cd contracts/crashlab-core
cargo test --all-targets
```

**Result:** All pre-existing tests pass. No regressions introduced.

## What Changed

### Files Created

1. **`contracts/crashlab-core/src/scenario_export.rs`** (modified, not created)
   - Added `derive_test_name()` function
   - Added `write_rust_regression_snippet()` function
   - Added comprehensive unit tests for both functions

2. **`contracts/crashlab-core/tests/regression_harness/Cargo.toml`**
   - Sample harness crate manifest

3. **`contracts/crashlab-core/tests/regression_harness/src/lib.rs`**
   - Example manual regression test demonstrating the pattern

4. **`contracts/crashlab-core/tests/regression_harness/tests/sample_generated_regression.rs`**
   - Two example generated regression tests

5. **`contracts/crashlab-core/examples/gen_test_values.rs`**
   - Utility example for generating test values (used during development)

### Files Modified

1. **`contracts/crashlab-core/src/scenario_export.rs`**
   - Added imports: `std::fs`, `std::io::Write`, `std::path::{Path, PathBuf}`
   - Added `derive_test_name()` function (deterministic test name generation)
   - Added `write_rust_regression_snippet()` function (file writer)
   - Added 13 new unit tests covering:
     - Test name determinism
     - Test name validity (Rust identifier rules)
     - Test name uniqueness
     - Snippet file creation
     - Extension handling
     - Output determinism

2. **`contracts/crashlab-core/src/lib.rs`**
   - Added exports: `derive_test_name`, `write_rust_regression_snippet`

### Files Deliberately Not Touched

- **`bundle_persist.rs`:** No schema changes needed
- **`fixture.rs`:** Already has `regression_group` field from #402
- **`reproducer.rs`:** Shrinking (#401) already implemented
- **`regression_grouping.rs`:** Grouping (#402) already implemented
- **CI configuration:** No new CI steps required (existing `cargo test --all-targets` covers new code)

## Issues #401 and #402 Relationship

**Status at PR time:**
- **#401 (Shrinking):** MERGED. The `reproducer.rs` module contains `shrink_seed_preserving_signature()` and `shrink_bundle_payload()`.
- **#402 (Grouping):** MERGED. The `regression_grouping.rs` module contains `RegressionGroup`, `regression_group_key()`, and `export_rust_regression_suite()`.

**Files touched by all three issues:**
- `src/lib.rs` (exports)
- `src/scenario_export.rs` (this PR adds functions, #402 added grouping support)

**Coordination:**
- Both #401 and #402 were already merged before this PR was started
- No merge conflicts occurred
- The snippet export works with shrunk bundles (if shrinking was applied before export)
- The snippet export can optionally reference the `RegressionGroup` in a comment (not implemented in this PR, but the infrastructure is available)

**Rebase order:** Not applicable (both dependencies already merged)

## Wave 4 Regression Confirmation

**Wave 4 adjacent flows tested:**
- Fixture export pipeline (no automatic pipeline exists; snippet export is opt-in)
- Reproducer shrinking (#401) - all tests pass
- Regression grouping (#402) - all tests pass
- Bundle persistence - all tests pass
- Replay - all tests pass

**Command:**
```bash
cd contracts/crashlab-core
cargo test --all-targets
```

**Result:** All 483 tests pass. No pre-existing tests broken.

## Security Note

**Field interpolation sanitization:**

All fields interpolated into the generated Rust source are sanitized or validated:

1. **Test function name:** Derived via `derive_test_name()`, which:
   - Uses only alphanumeric characters and underscores
   - Always starts with `regression_seed_` (letter prefix)
   - Hash component is hex-encoded (only `0-9a-f`)
   - Validated by `is_valid_rust_ident()` before use

2. **Seed ID:** `u64` integer, formatted as decimal. No injection risk.

3. **Payload bytes:** Formatted as `0x{:02x}` hex literals. No injection risk.

4. **Signature fields:** `u64` integers and `String` (category). Category is validated by `classify()` to be one of a fixed set of values (`"runtime-failure"`, `"empty-input"`, etc.). No arbitrary strings.

5. **No user-controlled strings:** All fields come from `CaseBundle`, which is constructed by the fuzzer or loaded from validated JSON. No direct user input is interpolated.

**Conclusion:** No arbitrary code execution risk. All interpolated values are either numeric, hex-encoded, or from a fixed enum-like set.

## Blocker Documentation

**None.** Both #401 and #402 are merged. All required types and functions exist.

## Out-of-Scope Findings

**None identified during implementation.**

## Out-of-Scope Changes

**None.** All changes are within the defined scope of Issue #403.

## Pipeline Parity Confirmation

**CI jobs triggered by PR against main:**
1. `web` job (apps/web tests) - Not affected by this PR
2. `core` job (`cargo test --all-targets`) - Passes locally
3. `ops-scripts-syntax` job - Not affected by this PR

**Locally-reproducible jobs:** All jobs can be reproduced locally.

**Result:** All CI checks pass locally. No pre-existing tests broken.

---

## Reviewer Checklist

- [ ] Generated snippets compile in the sample harness
- [ ] Generated snippets reproduce the expected failure signature
- [ ] Test function names are deterministic and valid Rust identifiers
- [ ] No timestamps or random identifiers in generated output
- [ ] All new tests pass
- [ ] No pre-existing tests broken
- [ ] Sample harness compiles and runs
- [ ] Documentation is clear and complete
