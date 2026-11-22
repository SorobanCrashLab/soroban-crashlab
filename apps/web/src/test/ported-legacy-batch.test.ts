/**
 * #1388 — Demonstration batch: 15+ legacy script-style tests ported to Vitest.
 *
 * Each test wraps one legacy assertion script in a `test()` block. Importing the
 * module executes its top-level assertions; any throwing assertion surfaces as a
 * failing test — identical semantics to the old `node <file>.js` exit-code model.
 *
 * These files are NOT removed from their original locations (the script-style
 * discovery wrapper in script-style-tests.test.ts continues to handle the full
 * corpus). Explicit `test()` wrappers here give reviewers a clear view of what
 * was ported in this batch and serve as the canonical pattern for future ports.
 *
 * Files ported in this batch (alphabetical within directory):
 *   src/app/api/runs/get-run-by-id.test.ts
 *   src/app/api/runs/runs-api.test.ts
 *   src/app/alerting-settings-utils.test.ts
 *   src/app/alerting-settings-page-utils.test.ts
 *   src/app/custom-widgets-utils.test.ts
 *   src/app/maintainer-conflict-policy.test.ts
 *   src/app/run-annotations-utils.test.ts
 *   src/app/run-issue-utils.test.ts
 *   src/app/run-tags-utils.test.ts
 *   src/app/generate-ts-reproducer.test.ts
 *   src/app/integrate-integration-test-harness-utils.test.ts
 *   src/app/integrate-replay-e2e-utils.test.ts
 *   src/app/integrate-ci-integration-for-run-replay-tests-utils.test.ts
 *   src/app/integrate-automated-regression-deploy-integration-utils.test.ts
 *   src/app/integrate-sentry-integration-for-crash-reporting-utils.test.ts
 *   src/app/integrate-metrics-export-to-prometheus-utils.test.ts
 *   src/lib/debounce-utils.test.ts
 *   src/lib/logger.test.ts
 *
 * JSX-dependent scripts skipped (require @testing-library/react decisions outside
 * this scope): add-run-cluster-visualization.test.ts,
 * integrations/artifacts/page.test.ts, settings/api/page.test.ts.
 *
 * Remaining script-style files not yet explicitly ported are listed in
 * src/test/script-style-tests.ts (QUARANTINED_TESTS lists known failures).
 * Fleet-wide explicit porting is follow-up work.
 */

import { describe, it } from 'vitest';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '../..');

/**
 * Wraps a legacy script-style module import in a Vitest `it()`.
 * The dynamic import executes top-level assertions; any throw propagates as a
 * test failure. `/* @vite-ignore *\/` suppresses the "dynamic import" lint warning.
 */
function legacyTest(relativePath: string): void {
  it(relativePath, async () => {
    await import(/* @vite-ignore */ path.join(WEB_ROOT, relativePath));
  });
}

// ---------------------------------------------------------------------------
// Batch 1 — API / runs (2 files)
// ---------------------------------------------------------------------------
describe('api/runs', () => {
  legacyTest('src/app/api/runs/get-run-by-id.test.ts');
  legacyTest('src/app/api/runs/runs-api.test.ts');
});

// ---------------------------------------------------------------------------
// Batch 2 — app utilities (7 files)
// ---------------------------------------------------------------------------
describe('app utilities', () => {
  legacyTest('src/app/alerting-settings-utils.test.ts');
  legacyTest('src/app/alerting-settings-page-utils.test.ts');
  legacyTest('src/app/custom-widgets-utils.test.ts');
  legacyTest('src/app/maintainer-conflict-policy.test.ts');
  legacyTest('src/app/run-annotations-utils.test.ts');
  legacyTest('src/app/run-issue-utils.test.ts');
  legacyTest('src/app/run-tags-utils.test.ts');
});

// ---------------------------------------------------------------------------
// Batch 3 — integration/reproduce utilities (6 files)
// ---------------------------------------------------------------------------
describe('integrate utilities', () => {
  legacyTest('src/app/generate-ts-reproducer.test.ts');
  legacyTest('src/app/integrate-integration-test-harness-utils.test.ts');
  legacyTest('src/app/integrate-replay-e2e-utils.test.ts');
  legacyTest('src/app/integrate-ci-integration-for-run-replay-tests-utils.test.ts');
  legacyTest('src/app/integrate-automated-regression-deploy-integration-utils.test.ts');
  legacyTest('src/app/integrate-sentry-integration-for-crash-reporting-utils.test.ts');
  legacyTest('src/app/integrate-metrics-export-to-prometheus-utils.test.ts');
});

// ---------------------------------------------------------------------------
// Batch 4 — lib utilities (2 files)
// ---------------------------------------------------------------------------
describe('lib utilities', () => {
  legacyTest('src/lib/debounce-utils.test.ts');
  legacyTest('src/lib/logger.test.ts');
});
