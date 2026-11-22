import fs from 'node:fs';
import path from 'node:path';

/**
 * Support for the script-style tests that predate the Vitest migration.
 *
 * Historically every test in this app was a bare TypeScript program: top-level
 * `node:assert` calls that throw on failure, compiled with `tsc` into
 * `build/test-tmp/` and executed with `node`. Each one needed its own hand-
 * maintained `npm run test:*` entry listing every transitive source file, and
 * the monolithic `test` script chained ~40 of them together. That list drifted
 * out of sync with the tree — deleting a source file left a dangling reference
 * that broke CI (see the `integrate-run-issue-link-integration-tests-utils`
 * entry removed in this change).
 *
 * Rather than rewrite ~100 working files at once, Vitest discovers them from
 * disk and `script-style-tests.test.ts` runs each one inside an `it()`. A
 * throwing assertion fails that case, exactly as `node` exiting non-zero used
 * to. New tests should be written as ordinary Vitest suites; those are picked
 * up directly by the `include` glob and skipped by the discovery below.
 */

/** Matches an import of the Vitest API, which marks a file as a real suite. */
const VITEST_IMPORT = /from\s+['"]vitest['"]/;

const TEST_FILE = /\.test\.tsx?$/;

/**
 * Script-style tests that already failed before the migration and are excluded
 * from the run so CI reflects real regressions. None of these were reachable
 * from the old `npm test`; they were orphaned or wired to a `test:*` script
 * that had been failing. Grouped by why they fail — each needs its own fix.
 *
 * Missing devDependencies (`@jest/globals`, `fast-check`,
 * `@testing-library/react`), assertions against docs that have since been
 * rewritten, and component-shape assertions whose components have moved on.
 */
export const QUARANTINED_TESTS: readonly string[] = [
  'src/app/AlertPresets.test.ts',
  'src/app/ContributorSLATargets.test.ts',
  'src/app/FailureClusterView.test.ts',
  'src/app/TimelineScrubber.test.ts',
  'src/app/add-a-fuzzy-query-builder-page.test.ts',
  'src/app/add-accessible-keyboard-nav-blueprint.test.ts',
  'src/app/add-column-customization.test.ts',
  'src/app/add-heatmap-interactions.test.ts',
  'src/app/add-resource-fee-insight-panel.test.tsx',
  'src/app/add-run-cluster-overview.test.ts',
  'src/app/add-run-filtering-by-severity.test.ts',
  'src/app/api-error-report-page.test.ts',
  'src/app/campaign-milestone-timeline-utils.test.ts',
  'src/app/components/OnboardingWizard.test.ts',
  'src/app/create-advanced-dashboard-filters-page.test.tsx',
  'src/app/dependency-update-policy.test.ts',
  'src/app/integrations/page.test.ts',
  'src/app/maintainer-mode-utils.test.ts',
  'src/app/page.integration.test.ts',
  'src/app/page.test.tsx',
  'src/app/run-filter-utils.test.ts',
  'src/app/runs/[id]/RunTimeline.test.ts',
  'src/app/secret-scanning-guidance.test.ts',
  'src/app/security-policy.test.ts',
  'src/app/settings/accessibility/page.test.tsx',
  'src/app/settings/alerting/page.test.tsx',
  'src/app/settings/notifications/page.test.tsx',
  'src/app/webhook-manager.test.ts',
];

/**
 * Escapes a literal path so it survives being used as a glob. Next.js dynamic
 * segments such as `runs/[id]` would otherwise read as a character class and
 * silently match nothing.
 */
export function toGlobPattern(relativePath: string): string {
  return relativePath.replace(/[[\]]/g, '\\$&');
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEST_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Paths of the runnable script-style tests, relative to the app root and using
 * forward slashes. Excludes real Vitest suites and quarantined files.
 */
export function findScriptStyleTests(webRoot: string): string[] {
  const quarantined = new Set(QUARANTINED_TESTS);

  return walk(path.join(webRoot, 'src'), [])
    .map((abs) => path.relative(webRoot, abs).split(path.sep).join('/'))
    .filter((rel) => !quarantined.has(rel))
    .filter((rel) => !VITEST_IMPORT.test(fs.readFileSync(path.join(webRoot, rel), 'utf8')))
    .sort();
}
