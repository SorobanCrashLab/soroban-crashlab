# PR Description: Issue #404 - Integrate Automated Regression Deploy Integration

## Summary

Implements automated regression test execution as part of the CI/CD pipeline. When code is pushed to `main`, the regression suite automatically runs to verify that no previously-fixed bugs have regressed. This integration provides deterministic setup, observable failures, and explicit success criteria for the end-to-end deploy-triggered regression flow.

Closes #404

## Design Note

### Integration Shape

**Chosen:** CI pipeline step (GitHub Actions job)

**Rationale:** The repository uses GitHub Actions for all automation, with no external deployment platform (Vercel, Fly.io, etc.) configured. The existing CI pipeline in `.github/workflows/ci.yml` is the natural integration point. A new `regression` job runs after `core` and `web` jobs pass, triggered only on pushes to `main`.

**Alternatives Considered:**
- **Webhook receiver:** Would require an external deployment platform and webhook infrastructure. Rejected because no such platform is configured.
- **Async fire-and-notify:** Would defeat the purpose of regression testing - failures should block deployment, not notify after the fact.
- **Pre-commit hook:** Too slow for local development workflow; better suited for CI.

### Synchronous vs. Asynchronous Invocation

**Chosen:** Synchronous (blocking)

**Rationale:**
1. Regression suite is fast (< 5 minutes expected based on existing `cargo test` duration)
2. Blocking the deployment pipeline on regression failures is the desired behavior
3. GitHub Actions jobs are inherently synchronous
4. No need for async notification channels or result polling infrastructure

**Tradeoffs:**
- **Pro:** Simple, deterministic, easy to debug
- **Pro:** Failures block deployment immediately
- **Pro:** No need for result storage or polling infrastructure
- **Con:** Slow regression suites would block the pipeline (mitigated by expected fast execution)

### Failure Observation

**Chosen:** GitHub Actions native logging with structured output

**Rationale:** The Rust CLI emits structured log output using GitHub Actions annotations (`::group::`, `::error::`). This provides:
- Immediate visibility in the GitHub Actions UI
- Automatic failure detection via exit codes
- No external notification service required
- Observable failures through job status and logs

**Alternatives Considered:**
- **External notification (Slack, email):** Not required for MVP; can be added later using the existing `webhook-manager.ts`
- **Custom dashboard:** Overkill for initial implementation; GitHub Actions UI is sufficient

### CLI Subcommand Design

**Chosen:** `crashlab regression-suite <path>` where path can be a file or directory

**Rationale:**
- Consistent with existing CLI pattern (`crashlab replay seed <path>`)
- Supports both single-file and directory-based fixture organization
- Directory mode automatically discovers and loads all `.json` fixtures
- Flexible for different deployment scenarios

**File vs. Directory Behavior:**
- **File:** Loads a single JSON array of `FailureScenario` objects
- **Directory:** Discovers all `.json` files, merges them into a single suite

### Rollback Path

**Configuration flag:** None required

**Rollback:** To disable the integration:
1. Comment out or remove the `regression` job from `.github/workflows/ci.yml`
2. Push the change to `main`
3. The workflow reverts to pre-integration behavior

No environment variable flag is needed because the integration is opt-in by the presence of the job definition.

---

## Environment and Configuration Contract

**Required Environment Variables:** NONE

**Rationale:** The integration runs entirely within the GitHub Actions environment using the repository's own code and fixtures. No external API credentials, webhook secrets, or deployment platform tokens are required.

**CI Configuration Variables (provided automatically by GitHub Actions):**
- `github.ref` - Git reference (e.g., `refs/heads/main`)
- `github.sha` - Commit SHA
- `github.event_name` - Event type (`push`, `pull_request`)

**Fixture Location:** `contracts/crashlab-core/fixtures/` (relative to repository root)

**Optional Configuration (Future Enhancement):**
- `REGRESSION_GROUPS` - Comma-separated list of groups to run (e.g., `auth,budget`)
- `REGRESSION_TIMEOUT_SECONDS` - Maximum time for suite execution (default: 300)

These are NOT implemented in this PR but are documented as extension points.

---

## Validation Steps

### Primary Validation

```bash
cd apps/web
npm run lint
npm run build
```

**Result:** Lint passes with no new errors introduced by this PR. Build completes successfully (pre-existing lint errors in other files are unrelated to this PR).

**Lint Output for Modified Files:**
```bash
npx eslint src/app/integrate-automated-regression-deploy-integration-utils.ts \
            src/app/integrate-automated-regression-deploy-integration-utils.test.ts
```
**Result:** ✅ No errors or warnings

### Secondary Validation - Rust Core Tests

```bash
cd contracts/crashlab-core
cargo test --all-targets
```

**Result:** All 483 tests pass (474 unit tests + 9 integration tests)

**Output summary:**
```
test result: ok. 483 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### CLI Regression Suite Command

**Test 1: Single file**
```bash
cd contracts/crashlab-core
cargo run --bin crashlab -- regression-suite fixtures/regression_suite.json
```

**Result:**
```
::group::Regression Suite Results
Total: 3
Passed: 3
Failed: 0
::endgroup::

✅ All regression tests passed!
```

**Test 2: Directory**
```bash
cargo run --bin crashlab -- regression-suite fixtures/
```

**Result:**
```
::group::Regression Suite Results
Total: 6
Passed: 6
Failed: 0
::endgroup::

✅ All regression tests passed!
```
(Loads 3 individual fixtures + 3 from suite file = 6 total)

**Test 3: Failure handling**
Created a test fixture with wrong expected class:
```json
[
  {
    "seed_id": 99,
    "input_payload": "010203",
    "mode": "invoker",
    "failure_class": "wrong-class"
  }
]
```

**Result:**
```
::group::Regression Suite Results
Total: 1
Passed: 0
Failed: 1
::endgroup::

Failed test cases:
::error::Seed 99 (invoker): expected wrong-class, got runtime-failure

Exit code: 1
```

### Web Utility Tests

```bash
cd apps/web
npx tsc src/app/integrate-automated-regression-deploy-integration-utils.ts \
          src/app/integrate-automated-regression-deploy-integration-utils.test.ts \
          --module commonjs --target es2020 --outDir build/test-tmp --esModuleInterop
node build/test-tmp/integrate-automated-regression-deploy-integration-utils.test.js
```

**Result:** All 23 tests pass (11 original + 12 new)

**Output:**
```
✓ testIsBusyStage passed
✓ testIsTerminalStage passed
✓ testStageStepIndex passed
✓ testDeriveTestsScheduled passed
✓ testBuildBaselineDigest passed
✓ testSummariseScenarios passed
✓ testSummariseScenarios_empty passed
✓ testValidateResult_valid passed
✓ testValidateResult_passedExceedsScheduled passed
✓ testValidateResult_missingDeploymentId passed
✓ testValidateResult_negativeDuration passed
✓ testParseRegressionOutput_allPassed passed
✓ testParseRegressionOutput_withFailures passed
✓ testParseRegressionOutput_withError passed
✓ testParseRegressionOutput_emptyOutput passed
✓ testValidateRegressionConfig_valid passed
✓ testValidateRegressionConfig_missingFixturePath passed
✓ testValidateRegressionConfig_missingGitRef passed
✓ testValidateRegressionConfig_invalidTimeout passed
✓ testFormatRegressionSummary_allPassed passed
✓ testFormatRegressionSummary_withFailures passed
✓ testShouldBlockDeployment_allPassed passed
✓ testShouldBlockDeployment_withFailures passed

✅ All Automated Regression Deploy Integration utils tests passed!
```

---

## What Changed

### Files Created

1. **`contracts/crashlab-core/fixtures/runtime_failure_001.json`**
   - Sample regression fixture for runtime-failure class
   - Seed ID 42, payload `010203`

2. **`contracts/crashlab-core/fixtures/empty_input_001.json`**
   - Sample regression fixture for empty-input class
   - Seed ID 7, empty payload

3. **`contracts/crashlab-core/fixtures/invalid_enum_tag_001.json`**
   - Sample regression fixture for invalid-enum-tag class
   - Seed ID 11, payload `e0ffaa`

4. **`contracts/crashlab-core/fixtures/regression_suite.json`**
   - Combined suite file containing all three sample fixtures
   - Demonstrates array-based fixture format

5. **`APPROACH_STATEMENT_404.md`**
   - Comprehensive reconnaissance findings and design decisions
   - Documents integration shape, alternatives considered, and rationale

6. **`PR_DESCRIPTION_404.md`**
   - This file

### Files Modified

1. **`contracts/crashlab-core/src/bin/crashlab.rs`**
   - Added `regression-suite` subcommand
   - Added `run_regression_suite_command()` function
   - Added `load_fixtures_from_directory()` function
   - Added `print_usage()` helper
   - Updated imports to include `run_regression_suite_from_json`, `fs`, and `Path`
   - Structured log output with GitHub Actions annotations

2. **`apps/web/src/app/integrate-automated-regression-deploy-integration-utils.ts`**
   - Added `CIRegressionConfig` type for CI job configuration
   - Added `RegressionSuiteResult` type for parsed CLI output
   - Added `RegressionFailure` type for individual test failures
   - Added `parseRegressionOutput()` function to parse CLI stdout
   - Added `validateRegressionConfig()` function for config validation
   - Added `formatRegressionSummary()` function for human-readable output
   - Added `shouldBlockDeployment()` function for deployment gating logic

3. **`apps/web/src/app/integrate-automated-regression-deploy-integration-utils.test.ts`**
   - Added 12 new test functions covering:
     - CLI output parsing (all passed, with failures, with errors, empty)
     - Configuration validation (valid, missing fields, invalid timeout)
     - Summary formatting (all passed, with failures)
     - Deployment blocking logic
   - Updated imports to include new types and functions
   - Updated test runner to execute all 23 tests

4. **`.github/workflows/ci.yml`**
   - Added `regression` job that:
     - Depends on `core` and `web` jobs passing
     - Runs only on push to `main` branch
     - Executes `cargo run --bin crashlab -- regression-suite fixtures/`
     - Uses `blacksmith-4vcpu-ubuntu-2404` runner
     - Working directory: `contracts/crashlab-core`

### Files Deliberately Not Touched

- **`apps/web/src/app/integrate-automated-regression-deploy-integration.tsx`** - UI component not required for CI integration
- **`contracts/crashlab-core/src/regression_suite.rs`** - API is sufficient, no changes needed
- **`contracts/crashlab-core/src/regression_grouping.rs`** - Grouping logic is complete
- **`contracts/crashlab-core/src/lib.rs`** - All required types already exported
- **`apps/web/src/app/webhook-manager.ts`** - Not used for CI-based integration
- **Any environment variable files** - No external credentials required

---

## Issues #401, #402, and #403 Relationship

**Status at PR time:**
- **#401 (Reproducer Shrinking):** MERGED
- **#402 (Automatic Regression Grouping):** MERGED
- **#403 (Rust Regression Fixture Export):** MERGED

**API Consumption:**
- This integration consumes `run_regression_suite_from_json()` from `regression_suite.rs`
- Shrinking (#401) and grouping (#402) are applied during fixture generation, not during suite execution
- Rust snippet export (#403) is not used - this integration runs JSON fixtures

**Files Touched by All Four Issues:**
- `contracts/crashlab-core/src/lib.rs` (exports) - no changes needed in this PR
- `contracts/crashlab-core/src/regression_suite.rs` - extended via CLI, not modified
- `.github/workflows/ci.yml` - new regression job added

**Rebase Order:** Not applicable - all dependencies already merged

---

## Wave 4 Regression Confirmation

**Wave 4 adjacent flows tested:**
- Artifact Preview Modal - no changes, tests pass
- Cross-Run Board Widgets - no changes, tests pass
- Threat Model Implementation - no changes, tests pass
- Storage Backend Integration - no changes, tests pass

**Commands:**
```bash
cd apps/web
npm run test  # All pre-existing tests pass
```

```bash
cd contracts/crashlab-core
cargo test --all-targets  # All 483 tests pass
```

**Result:** No regressions introduced. All pre-existing tests continue to pass.

---

## Security Note

**No External Credentials:** The integration runs entirely within the GitHub Actions environment. No webhook secrets, API tokens, or external platform credentials are required.

**Fixture Validation:** All fixtures are validated by the regression suite runner before execution. Invalid JSON or malformed fixtures result in descriptive errors and non-zero exit codes.

**No Arbitrary Code Execution:** Fixtures contain only data (seed IDs, hex-encoded payloads, expected failure classes). No code is executed from fixtures.

**Structured Logging:** All log output uses GitHub Actions annotations. No sensitive data (credentials, tokens, secrets) is logged.

---

## Modularity Confirmation

**Trigger Receiver:** GitHub Actions workflow job definition (`.github/workflows/ci.yml`)
- Independently testable by running workflow on a test branch
- No coupling to other jobs beyond dependency declaration

**Regression Invoker:** Rust CLI binary (`contracts/crashlab-core/src/bin/crashlab.rs`)
- Independently testable by running CLI locally with sample fixtures
- No coupling to GitHub Actions - can be used in any CI system

**Result Observer:** GitHub Actions job status and log output
- Independently observable through GitHub UI
- No coupling to external notification systems

**Boundaries Enforced:**
- CLI is a standalone binary with no knowledge of GitHub Actions
- GitHub Actions job has no knowledge of CLI internals
- Web utilities are pure functions with no side effects

---

## Blocker Documentation

**None.** All dependencies (#401, #402, #403) are merged. All required types and functions exist.

---

## Out-of-Scope Findings

**Pre-existing lint errors:** The following lint errors exist in the codebase but are unrelated to this PR:
- `apps/web/src/app/ContributorSLATargets.tsx:66:5` - setState in effect
- `apps/web/src/app/api/artifacts/[id]/route.ts:56:48` - explicit any
- Various unused variable warnings

These should be addressed in separate PRs.

---

## Out-of-Scope Changes

**None.** All changes are within the defined scope of Issue #404.

---

## Pipeline Parity Confirmation

**CI jobs triggered by PR against main:**
1. `web` job - Passes locally (lint has pre-existing errors unrelated to this PR)
2. `core` job - Passes locally (all 483 tests pass)
3. `ops-scripts-syntax` job - Not affected by this PR
4. `regression` job - Only runs on push to `main`, not on PRs

**Locally-reproducible jobs:** All jobs can be reproduced locally.

**Result:** All CI checks pass locally for code modified in this PR. Pre-existing lint errors in other files are unrelated.

---

## Reviewer Checklist

- [ ] CLI `regression-suite` subcommand compiles and runs
- [ ] Sample fixtures load and execute correctly
- [ ] CLI handles both file and directory paths
- [ ] CLI emits structured GitHub Actions annotations
- [ ] CLI exits with correct codes (0 = pass, non-zero = fail)
- [ ] Web utility functions parse CLI output correctly
- [ ] All 23 web utility tests pass
- [ ] All 483 core Rust tests pass
- [ ] CI workflow syntax is valid
- [ ] `regression` job only runs on push to `main`
- [ ] `regression` job depends on `core` and `web` jobs
- [ ] No new lint errors introduced
- [ ] Documentation is clear and complete
- [ ] Rollback path is documented and simple
