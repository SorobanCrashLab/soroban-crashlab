# Approach Statement: Issue #402 - Create Automatic Regression Grouping

## Reconnaissance Summary

### 1. **Existing Crash Grouping Module**

**State:** A crash grouping module DOES exist in `src/taxonomy.rs`.

**Current Implementation:**
- Defines `FailureClass` enum with 7 variants: `Auth`, `Budget`, `State`, `Xdr`, `EmptyInput`, `OversizedInput`, `Unknown`
- Function `classify_failure(seed: &CaseSeed) -> FailureClass` — deterministic classification based on payload structure
- Function `group_by_class(seeds: &[CaseSeed]) -> HashMap<FailureClass, Vec<&CaseSeed>>` — groups seeds by class
- Each variant has stable `as_str()` method returning: "auth", "budget", "state", "xdr", "empty-input", "oversized-input", "unknown"
- All variants are hashable and displayable

**Extension vs. Replacement:** This implementation will EXTEND `taxonomy.rs` by defining a composite `RegressionGroup` type that pairs domain risk area (reusing `FailureClass`) with failure mode (derived from `CrashSignature`). No replacement of existing functionality.

---

### 2. **Failure Signature and Fixture Metadata**

**Existing Signature Mechanism:**
- `CrashSignature` struct (in `lib.rs`) contains:
  - `category: &'static str` ("empty-input", "oversized-input", or "runtime-failure")
  - `digest: u64` (simple hash from payload bytes)
  - `signature_hash: u64` (stable FNV-1a hash derived from category and payload)
- Computed deterministically via `compute_signature_hash(category: &str, payload: &[u8]) -> u64`

**Failure Mode Classification:**
- The existing `signature_hash` field is already a **sufficient failure mode classifier**
  - It is stable: same payload always produces same hash
  - It is coarse-grained: different error root causes produce different hashes, but the same root cause with different minor variations produces the same hash
  - It is human-incomprehensible but deterministic
  - **Decision:** Use `signature_hash` directly as the failure mode identifier; no new abstraction needed

**Fixture Metadata Fields:**
- No fixture schema currently exists in the codebase
- This task must define a new optional `regression_group: Option<RegressionGroup>` field to be added to fixtures during export
- Field will be populated during export pipeline integration

**New Field Definition:**
```rust
pub struct RegressionFixture {
    pub seed_id: u64,
    pub payload: Vec<u8>,
    pub category: String,
    pub signature_hash: u64,
    // New field added by this task:
    pub regression_group: Option<RegressionGroup>,
}
```

---

### 3. **Domain Risk Area Taxonomy**

**Existing Taxonomy:** REUSE existing `FailureClass` enum from `taxonomy.rs`. It already provides exactly the domain risk area classification needed:

- **Auth** — Authorization check failed: missing or invalid auth entry
- **Budget** — Execution budget exceeded: CPU or memory limit hit
- **State** — Ledger state error: missing entry, type mismatch, or version conflict
- **Xdr** — XDR encoding or decoding error: malformed or out-of-range value
- **EmptyInput** — Seed payload was empty; no execution attempted
- **OversizedInput** — Seed payload exceeded the maximum allowable size (> 64 bytes)
- **Unknown** — Raw failure did not match any known category

**Source:** These areas are already defined as the "Stable failure categories for Soroban contract crashes" with full documentation in `src/taxonomy.rs` lines 1–17.

**Derivation:** Classification is performed by `classify_failure(seed: &CaseSeed) -> FailureClass` using deterministic byte-range matching on `payload[0]`.

**Stability Enforcement:** Each variant already has explicit `as_str()` method returning stable string labels, and all variants are in the published `FailureClass::ALL` constant array. The serialised form is stable across future enum extensions due to the fixed labels.

---

### 4. **Suite Runner: Discovery and Selection Mechanism**

**Current State:** No suite runner exists in the codebase yet.

**Design:**
- Create new module `src/suite_runner.rs` with:
  - `RegressionFixture` struct (fixture format)
  - `RegressionFixtureLoader` that reads fixtures from disk
  - `SuiteRunner` struct that:
    - Discovers fixtures from a directory
    - Filters by zero or more `RegressionGroup` identifiers
    - Executes each fixture's reproducer
    - Collects pass/fail results
    - Emits group summary

**Group Selection Extension Point:**
- CLI argument: `--groups` (accepts comma-separated RegressionGroup serialised identifiers)
- Configuration field: `selected_groups: Vec<RegressionGroup>` in runner config
- Behaviour: Filter discovered fixtures to only those where `fixture.regression_group.as_ref() == Some(selected_group)` for any selected group
- Default (no selection): Execute all fixtures

**Selection Parameter Format:**
- Serialised as hyphen-separated string: `{domain_risk_area}#{signature_hash}`
- Example: `"auth#12345678901234567"` or `"state#99876543210987654"`
- Acceptance: runner must accept this format directly from CLI so maintainer can copy identifiers from fixture metadata

---

### 5. **Relationship with Issue #401 (Reproducer Shrinking)**

**Status:** Issue #401 (Add reproducer shrinking algorithm) is NOT YET implemented in main. Git history shows no shrinking changes.

**Coordination:**
- If #401 lands before this PR: Classification must use final (possibly shrunk) signature and input, NOT pre-shrink
- If both PRs are in flight: Both touch the fixture export pipeline; rebase order will be: #401 lands first (shrinking creates stable fixtures), then this PR lands (grouping is applied post-shrink)
- No files overlap between repos at present, but both will eventually touch:
  - `src/lib.rs` (exports and fixture schema)
  - Fixture export pipeline integration point (to be created)
  - Tests (both will have integration tests)

**Current Status:** Proceeding independently; no merge conflict expected since #401 is not in codebase.

---

### 6. **Fixture Schema Change**

**New Field:** Add optional `regression_group: Option<RegressionGroup>` to fixture schema.

**Backward Compatibility:** 
- Field is optional (`Option<RegressionGroup>`)
- Pre-implementation fixtures without this field load as `None`
- Loader treats `None` as "unclassified" group (same behaviour as Unknown group)
- No existing fields are removed or renamed
- Schema version field (if added by #401) will ease future migrations

**Loader Behaviour:**
```rust
impl RegressionFixture {
    pub fn load(path: &Path) -> Result<Self, LoadError> {
        // Deserialise JSON/bincode; if regression_group field missing, default to None
        // Return Ok with group=None for pre-implementation fixtures
    }
}
```

**Sanitiser Behaviour:**
- No sanitisation of group field itself (it's just enum discriminant + hash)
- Existing sanitiser (if any) continues unchanged

---

### 7. **Files to Create, Modify, and Deliberately NOT Touch**

### Files to Create:
1. `src/regression_group.rs` — RegressionGroup type definition, serialisation, equality, hashing, display
2. `src/fixture.rs` — RegressionFixture struct, schema, loader, default values
3. `src/fixture_classifier.rs` — Classifier function and rules; implements classification logic
4. `src/suite_runner.rs` — Suite runner with discovery, filtering, execution, summary reporting
5. `tests/regression_group_tests.rs` — Unit tests for grouping key
6. `tests/classifier_tests.rs` — Unit tests for classifier
7. `tests/suite_runner_tests.rs` — Integration tests for suite runner
8. `tests/fixture_schema_tests.rs` — Fixture load/save round-trip tests

### Files to Modify:
1. `src/lib.rs` — Export new modules and types; add pub use statements
2. `src/taxonomy.rs` — Add `impl From<FailureClass> for RegressionGroup` and display helper (minimal)
3. `Cargo.toml` — Add serde (for JSON serialisation) if needed; likely already available or not needed

### Files to Deliberately NOT Touch:
- `src/auth_matrix.rs` — Unrelated to grouping
- `src/reproducer.rs` — Not modified; grouping is post-export
- `src/seed_validator.rs` — Not modified
- `apps/web/` — Web tier is separate
- `.github/workflows/ci.yml` — Keep same command structure

---

### 8. **Blockers or Dependencies**

**No blockers identified.** 

All reconnaissance items are present and readable:
- ✅ Taxonomy exists and is stable
- ✅ Signature mechanism is defined and deterministic  
- ✅ Rust toolchain is stable (no version imposed)
- ✅ No external serialisation dependencies currently in use (will add serde if needed)
- ✅ #401 is not blocking (not merged; independent work)
- ✅ CI configuration is straightforward

---

## Implementation Plan

### Phase 1: Core Types (Days 1–2)
1. Define `RegressionGroup` struct in `src/regression_group.rs`
   - Fields: `domain: FailureClass`, `failure_mode: u64` (signature_hash)
   - Derive: `Clone, Copy, PartialEq, Eq, Hash`
   - Impl: `Display`, `Serialize`, `Deserialize`
2. Define `RegressionFixture` struct in `src/fixture.rs`
   - Includes new `regression_group: Option<RegressionGroup>` field
3. Update `src/lib.rs` exports

### Phase 2: Classification (Days 2–3)
1. Create `src/fixture_classifier.rs`
2. Implement `classify_fixture(seed: &CaseSeed, signature: &CrashSignature) -> RegressionGroup`
3. Implement classification rules with full documentation
4. Integrate into export pipeline (identified location TBD after examining reproducer.rs exports)

### Phase 3: Suite Runner (Days 3–4)
1. Create `src/suite_runner.rs`
2. Implement fixture discovery, loading, filtering
3. Implement group summary reporting
4. Add CLI/config interfaces

### Phase 4: Tests (Days 4–5)
1. Unit tests for `RegressionGroup` (serialisation, equality, display)
2. Unit tests for classifier (known metadata, unknown fallback, determinism)
3. Fixture schema tests (load/save, backward compat, invalid field handling)
4. Suite runner tests (selection, summary, multi-group)
5. Integration tests (full pipeline)

### Phase 5: CI & Documentation (Day 5)
1. Run full CI suite locally
2. Add code documentation and examples
3. Write PR description with design notes and validation steps

---

## Stability and Determinism Invariants

This implementation will guarantee:

1. **Deterministic Classification:** Same seed always produces same RegressionGroup
2. **Backward Compatibility:** Pre-#402 fixtures load without error
3. **Default Behaviour Preserved:** No group selection = all fixtures executed (identical to hypothetical pre-implementation behaviour)
4. **Accurate Summaries:** Pass/fail counts per group match actual execution outcomes
5. **Unknown Group Visibility:** Unknown groups produce warning logs, not silent defaults
6. **Serialisation Stability:** Adding new FailureClass variants in future won't change serialised form of existing variants

---

## Rollback Path

If grouping must be disabled post-merge:
1. Set CLI flag `--groups "unknown"` to execute only unclassified fixtures
2. Or: Set config field `selected_groups = ["unknown"]`
3. Or: Remove call to `classify_and_export_fixture()` from export pipeline; use `regression_group: None` for all exports going forward
4. No code revert required; fixtures remain intact and backward compatible

---

## Branch and Repository State

- **Branch name:** `feat/wave4-create-automatic-regression-grouping` (as specified in issue)
- **Branch point:** Will be created from `main` before implementation starts
- **Current main HEAD:** Will be confirmed via `git log --oneline -5` at branch time
- **Rebase:** Will rebase immediately if #401 lands during implementation
