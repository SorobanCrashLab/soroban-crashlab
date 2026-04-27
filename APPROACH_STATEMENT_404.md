# Approach Statement: Issue #404 - Integrate Automated Regression Deploy Integration

## Reconnaissance Summary

### Integration Shape Discovered

**Trigger Mechanism:** CI pipeline step (not webhook)

**Rationale:** After reading `.github/workflows/ci.yml`, the existing deployment model is a GitHub Actions CI pipeline with three jobs: `web`, `core`, and `ops-scripts-syntax`. There is NO existing deployment platform webhook infrastructure (Vercel, Fly.io, Railway, etc.). The repository uses GitHub Actions for all automation, and deployments (if they occur) would be triggered by pushes to `main` or PR merges.

**Integration Shape:** A new CI job that runs regression tests automatically after the `core` and `web` jobs pass. This job will:
1. Be triggered on push to `main` (deploy events)
2. Invoke the Rust regression suite runner from `contracts/crashlab-core`
3. Report results via structured log output (GitHub Actions native logging)
4. Exit with non-zero code on regression failures to block the workflow

**Authentication:** Not applicable (CI step, not webhook). No external webhook secret required.

**Payload:** GitHub Actions context variables (`github.ref`, `github.sha`, `github.event_name`)



---

### Deployment Platform and Mechanism

**Platform:** GitHub Actions (native CI/CD)

**Trigger:** `push` event to `main` branch (existing trigger in `.github/workflows/ci.yml`)

**Existing Pipeline:**
```yaml
on:
  pull_request:
  push:
    branches: [main]
```

**Integration Point:** Add a new `regression` job that depends on `core` and `web` jobs passing:
```yaml
regression:
  needs: [core, web]
  runs-on: blacksmith-4vcpu-ubuntu-2404
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  defaults:
    run:
      working-directory: contracts/crashlab-core
  steps:
    - uses: actions/checkout@v4
    - run: cargo run --bin crashlab -- regression-suite ./fixtures
```

**No External Webhook:** The integration does not require webhook signature validation, HMAC secrets, or external platform credentials because it runs entirely within the GitHub Actions environment.

---

### Existing Regression Suite Invocation Mechanism

**Location:** `contracts/crashlab-core/src/regression_suite.rs`

**API:**
- `load_regression_suite_json(bytes: &[u8]) -> Result<Vec<FailureScenario>, serde_json::Error>`
- `run_regression_suite(scenarios: &[FailureScenario]) -> RegressionSuiteSummary`
- `run_regression_suite_from_json(bytes: &[u8]) -> Result<RegressionSuiteSummary, serde_json::Error>`

**Invocation Pattern:** The regression suite is invoked programmatically by calling `run_regression_suite_from_json()` with a JSON byte array containing an array of `FailureScenario` objects.

**CLI Entry Point:** Based on README.md, there is a CLI binary at `contracts/crashlab-core/src/bin/crashlab.rs` (referenced as `cargo run --bin crashlab -- replay seed ./bundle.json`). This CLI must be extended to support a `regression-suite` subcommand.

**Current CLI Subcommands (from README):**
- `replay seed <bundle.json>` - Replay a single seed bundle

**Required Extension:**
- `regression-suite <fixtures-dir>` - Run all regression fixtures in a directory

**Return Values:**
- `RegressionSuiteSummary` contains:
  - `total: usize` - Total number of test cases
  - `passed: usize` - Number of passing tests
  - `failed: usize` - Number of failing tests
  - `cases: Vec<RegressionCaseResult>` - Individual case results
  - `all_passed() -> bool` - Convenience method

**Invocation Mode:** Synchronous (blocking). The CI job will wait for the regression suite to complete before proceeding. Typical run time is expected to be under 5 minutes based on the existing `cargo test` duration.

**Group Selection:** The regression suite runner supports filtering by `RegressionGroup` (from issue #402, already merged). The CLI will accept an optional `--groups` parameter to run only specific risk groups.

---

### Existing Integration Module Pattern

**Location:** `apps/web/src/app/integrate-*-utils.ts` files

**Pattern Observed:**
1. **Utility Module:** Pure functions in `integrate-{feature}-utils.ts`
   - Type definitions for configuration, results, and state
   - Pure utility functions (no React, no browser APIs)
   - Deterministic, testable logic
2. **Test Module:** Comprehensive tests in `integrate-{feature}-utils.test.ts`
   - Fixture factories (`makeScenario`, `makeResult`)
   - Unit tests for each utility function
   - Vacuousness checks (negative tests with concrete post-call invariants)
   - Test runner that exits with code 1 on failure
3. **Component Module:** React component in `integrate-{feature}.tsx` (optional)
   - Uses utility functions from the utils module
   - Handles UI rendering and user interaction

**Existing Integration Utilities:**
- `integrate-automated-regression-deploy-integration-utils.ts` - Already exists! Contains UI/display utilities for regression deploy scenarios
- `integrate-ci-integration-for-run-replay-tests-utils.ts` - CI job configuration and result validation
- `integrate-external-authentication-integration-utils.ts` - Auth provider management
- `integrate-sentry-integration-for-crash-reporting-utils.ts` - Error reporting integration
- `integrate-metrics-export-to-prometheus-utils.ts` - Metrics export integration

**Module Structure to Follow:**
```
apps/web/src/app/
├── integrate-automated-regression-deploy-integration-utils.ts (EXISTS - will extend)
├── integrate-automated-regression-deploy-integration-utils.test.ts (EXISTS - will extend)
└── integrate-automated-regression-deploy-integration.tsx (EXISTS - UI component)
```

**Key Finding:** The `integrate-automated-regression-deploy-integration-utils.ts` file ALREADY EXISTS and contains display/UI utilities for regression deploy scenarios. This task will EXTEND it with the actual integration logic (CI configuration validation, result parsing, failure reporting).

---

### Failure Observation Mechanism

**Primary Channel:** GitHub Actions native logging (stdout/stderr)

**Structured Logging Pattern:** The Rust CLI will emit structured log output that GitHub Actions can parse:
```
::group::Regression Suite Results
Total: 312
Passed: 310
Failed: 2
::endgroup::

::error file=contracts/crashlab-core/fixtures/auth_12345.json::Regression test failed: expected auth, got runtime-failure
::error file=contracts/crashlab-core/fixtures/budget_67890.json::Regression test failed: expected budget, got state
```

**Exit Code:** The CLI will exit with code 0 on all tests passing, non-zero on any failure.

**GitHub Actions Status:** The `regression` job will show as failed in the GitHub Actions UI when the CLI exits non-zero, blocking any subsequent deployment steps.

**No External Notification:** There is no existing Slack, email, or PagerDuty integration in the codebase. Failures are observable through:
1. GitHub Actions job status (red X in the UI)
2. GitHub commit status check (if configured)
3. Structured log output in the job logs

**Notification Extension Point:** The existing `webhook-manager.ts` could be used in a future enhancement to send notifications, but it is not required for this task.

---

### Relationship with Issues #401, #402, and #403

**Status at Implementation Time:**

- **#401 (Reproducer Shrinking):** MERGED
  - Module: `contracts/crashlab-core/src/reproducer.rs`
  - Functions: `shrink_seed_preserving_signature()`, `shrink_bundle_payload()`
  - Impact: Regression fixtures may contain shrunk payloads
  - Integration: No changes required; shrinking is transparent to the suite runner

- **#402 (Automatic Regression Grouping):** MERGED
  - Module: `contracts/crashlab-core/src/regression_grouping.rs`
  - Types: `RegressionGroup`, `RegressionGroupKey`
  - Functions: `regression_group_key()`, `group_bundles_by_regression_group()`
  - Impact: Fixtures have optional `regression_group` field
  - Integration: CLI will support `--groups` parameter to filter by group

- **#403 (Rust Regression Fixture Export):** MERGED
  - Module: `contracts/crashlab-core/src/scenario_export.rs`
  - Functions: `export_rust_regression_fixture()`, `write_rust_regression_snippet()`
  - Impact: Fixtures can be exported as Rust test snippets
  - Integration: The regression suite runner loads JSON fixtures (not Rust snippets)

**Files Touched by All Four Issues:**
- `contracts/crashlab-core/src/lib.rs` (exports)
- `contracts/crashlab-core/src/regression_suite.rs` (this PR extends)
- `.github/workflows/ci.yml` (this PR adds regression job)

**Rebase Order:** Not applicable - all dependencies are already merged.

**API Consumption:**
- This integration consumes `run_regression_suite_from_json()` from the regression suite module
- This integration does NOT directly call shrinking (#401) or grouping (#402) functions - those are applied during fixture generation, not during suite execution
- This integration does NOT use the Rust snippet export (#403) - it runs JSON fixtures

---

### Files to Create

1. **`contracts/crashlab-core/src/bin/crashlab.rs`** (extend existing)
   - Add `regression-suite` subcommand
   - Parse `--groups` optional parameter
   - Load fixtures from directory
   - Invoke `run_regression_suite_from_json()`
   - Emit structured log output
   - Exit with appropriate code

2. **`.github/workflows/ci.yml`** (modify existing)
   - Add `regression` job after `core` and `web`
   - Conditional on `push` to `main`
   - Run `cargo run --bin crashlab -- regression-suite ./fixtures`

3. **`contracts/crashlab-core/fixtures/`** (create directory)
   - Sample regression fixture JSON files for testing
   - At least 3 fixtures covering different failure classes

### Files to Modify

1. **`apps/web/src/app/integrate-automated-regression-deploy-integration-utils.ts`**
   - Add `CIRegressionConfig` type for CI job configuration
   - Add `RegressionSuiteResult` type for parsed CLI output
   - Add `parseRegressionOutput()` function to parse CLI stdout
   - Add `validateRegressionConfig()` function
   - Add `formatRegressionSummary()` function for display

2. **`apps/web/src/app/integrate-automated-regression-deploy-integration-utils.test.ts`**
   - Add tests for new utility functions
   - Add tests for CLI output parsing
   - Add tests for configuration validation
   - Add vacuousness checks for negative cases

3. **`contracts/crashlab-core/src/lib.rs`**
   - No changes required (all types already exported)

4. **`README.md`** (if CLI usage section exists)
   - Document new `regression-suite` subcommand

### Files Deliberately Not Touched

- **`apps/web/src/app/integrate-automated-regression-deploy-integration.tsx`** - UI component, not required for CI integration
- **`contracts/crashlab-core/src/regression_suite.rs`** - API is sufficient, no changes needed
- **`contracts/crashlab-core/src/regression_grouping.rs`** - Grouping logic is complete
- **`apps/web/src/app/webhook-manager.ts`** - Not used for CI-based integration
- **Any environment variable files** - No external credentials required

---

### Environment and Configuration Contract

**Required Environment Variables:** NONE

**Rationale:** The integration runs entirely within the GitHub Actions environment using the repository's own code and fixtures. No external API credentials, webhook secrets, or deployment platform tokens are required.

**CI Configuration Variables:**
- `github.ref` - Git reference (e.g., `refs/heads/main`)
- `github.sha` - Commit SHA
- `github.event_name` - Event type (`push`, `pull_request`)

These are provided automatically by GitHub Actions and do not require configuration.

**Fixture Location:** Hardcoded to `contracts/crashlab-core/fixtures/` (relative to repository root). This path is deterministic and does not require configuration.

**Optional Configuration (Future Enhancement):**
- `REGRESSION_GROUPS` - Comma-separated list of groups to run (e.g., `auth,budget`)
- `REGRESSION_TIMEOUT_SECONDS` - Maximum time for suite execution (default: 300)

These are NOT implemented in this PR but are documented as extension points.

---

### Blockers and Dependencies

**Blockers:** NONE

**Dependencies:**
- ✅ Issue #401 (Shrinking) - MERGED
- ✅ Issue #402 (Grouping) - MERGED  
- ✅ Issue #403 (Fixture Export) - MERGED
- ✅ Regression suite runner API - EXISTS in `regression_suite.rs`
- ✅ CLI binary infrastructure - EXISTS at `contracts/crashlab-core/src/bin/`

**Fixture Availability:** The integration requires at least one regression fixture to exist in `contracts/crashlab-core/fixtures/`. This PR will create sample fixtures for testing. Production fixtures will be generated by the fuzzer and exported using the #403 API.

---

### Integration Module Boundaries

**Trigger Receiver:** GitHub Actions workflow job definition (`.github/workflows/ci.yml`)
- Receives: GitHub push event
- Validates: Event type and branch name
- Invokes: Rust CLI subprocess

**Regression Invoker:** Rust CLI binary (`contracts/crashlab-core/src/bin/crashlab.rs`)
- Receives: Subcommand and fixture directory path
- Validates: Directory exists, fixtures are valid JSON
- Invokes: `run_regression_suite_from_json()`
- Returns: Structured log output and exit code

**Result Observer:** GitHub Actions job status and log output
- Receives: CLI exit code and stdout/stderr
- Observes: Job success/failure status in GitHub UI
- Reports: Structured error annotations in GitHub Actions logs

**Configuration:** Hardcoded in CI workflow (no external config file)

These boundaries are independently testable:
- Trigger receiver: Test by running workflow on a test branch
- Regression invoker: Test by running CLI locally with sample fixtures
- Result observer: Test by inspecting GitHub Actions job logs

---

### Synchronous vs. Asynchronous Invocation

**Decision:** Synchronous (blocking)

**Rationale:**
1. The regression suite is fast (expected < 5 minutes based on existing `cargo test` duration)
2. Blocking the deployment pipeline on regression failures is the desired behavior
3. GitHub Actions jobs are inherently synchronous - the workflow waits for each job to complete
4. No need for async notification channels or result polling

**Tradeoffs:**
- **Pro:** Simple, deterministic, easy to debug
- **Pro:** Failures block deployment immediately
- **Pro:** No need for result storage or polling infrastructure
- **Con:** Slow regression suites would block the pipeline (mitigated by expected fast execution)
- **Con:** No partial results if suite times out (mitigated by GitHub Actions timeout handling)

**Timeout Handling:** GitHub Actions has a default job timeout of 360 minutes. The regression job will inherit this timeout. If the suite exceeds the timeout, GitHub Actions will terminate the job and mark it as failed.

---

### Failure Handling Philosophy

**Non-Blocking Result Recording:** Not applicable (CI job, not webhook)

**Notification Failure Isolation:** Not applicable (no external notifications)

**Failure Modes:**
1. **Regression test failure:** CLI exits non-zero, job fails, deployment blocked
2. **Fixture loading error:** CLI exits non-zero with error message, job fails
3. **CLI crash:** CLI exits non-zero, job fails
4. **Timeout:** GitHub Actions terminates job, marks as failed

All failure modes result in the same observable outcome: the `regression` job fails, and the GitHub Actions workflow shows a red X.

**Rollback Path:** To disable the integration:
1. Comment out or remove the `regression` job from `.github/workflows/ci.yml`
2. Push the change to `main`
3. The workflow will revert to the pre-integration behavior (no regression job)

No environment variable flag is needed because the integration is opt-in by the presence of the job definition.

---

### Alternatives Considered

**Alternative 1: Webhook-Based Integration**
- **Description:** Add a webhook receiver in `apps/web` that listens for deployment events from an external platform (Vercel, Fly.io, etc.)
- **Rejected Because:** No external deployment platform is configured in the repository. The existing deployment model is GitHub Actions-based.

**Alternative 2: Async Fire-and-Notify**
- **Description:** Run regression suite asynchronously after deployment completes, send notification on failure
- **Rejected Because:** Defeats the purpose of regression testing - failures should block deployment, not notify after the fact

**Alternative 3: Pre-Commit Hook**
- **Description:** Run regression suite locally before allowing commits
- **Rejected Because:** Too slow for local development workflow; better suited for CI

**Alternative 4: Separate Workflow File**
- **Description:** Create `.github/workflows/regression.yml` instead of adding to `ci.yml`
- **Rejected Because:** Adds complexity; the regression job is logically part of the CI pipeline

---

### Wave 4 Adjacent Flows

**Identified Wave 4 Flows:**
- Artifact Preview Modal (issue #XXX) - `apps/web/src/app/implement-artifact-preview-modal-component.tsx`
- Cross-Run Board Widgets (issue #XXX) - `apps/web/src/app/implement-cross-run-board-widgets-component.tsx`
- Threat Model Implementation - `contracts/crashlab-core/src/threat_model_tests.rs`
- Storage Backend Integration - `apps/web/src/app/integrate-storage-backend-integration-for-artifacts.tsx`

**Regression Testing Strategy:**
1. Run full `apps/web` test suite: `cd apps/web && npm run test`
2. Run full `contracts/crashlab-core` test suite: `cd contracts/crashlab-core && cargo test --all-targets`
3. Confirm no test failures in either suite
4. Confirm no changes to any Wave 4 flow files

**No Coupling:** This integration does not import, call, or modify any Wave 4 flow code. The only shared dependency is the CI pipeline, which is extended (not modified) by adding a new job.

---

## Summary

**Integration Shape:** CI pipeline step (GitHub Actions job)

**Trigger:** Push to `main` branch

**Invocation:** Synchronous Rust CLI subprocess

**Result Observation:** GitHub Actions job status and structured log output

**Failure Handling:** Exit code 0 = pass, non-zero = fail (blocks deployment)

**Configuration:** Hardcoded in `.github/workflows/ci.yml` (no environment variables)

**Dependencies:** All merged (#401, #402, #403)

**Blockers:** None

**Files to Create:** CLI subcommand, sample fixtures, CI job definition

**Files to Modify:** Extend existing utils and tests in `apps/web`

**Files Not Touched:** UI components, webhook manager, Wave 4 flows

**Rollback:** Remove or comment out the `regression` job in `ci.yml`
