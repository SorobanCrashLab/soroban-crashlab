/**
 * Shared shapes for CI regression results (#1890, #1891).
 *
 * Pipeline: `crashlab regression-suite --report` (Rust) writes a
 * {@link RegressionSuiteReport}; the CI step classifies it against the
 * checked-in {@link RegressionBaseline} into a {@link CiRegressionResult},
 * which is rendered as the sticky PR summary and posted to
 * `POST /api/integrations/ci/results`.
 *
 * Kept free of runtime dependencies so the CI script can compile this module
 * with plain `tsc` (see apps/web/scripts/ci-regression.ts).
 */

export const CI_RESULT_SCHEMA_VERSION = 1;
export const REGRESSION_BASELINE_SCHEMA_VERSION = 1;

/** One row of the Rust `RegressionSuiteSummary` report. */
export interface RegressionCaseReport {
  seed_id: number;
  mode: string;
  expected_failure_class: string;
  actual_failure_class: string | null;
  passed: boolean;
  error: string | null;
}

/** JSON written by `crashlab regression-suite <suite> --report <file>`. */
export interface RegressionSuiteReport {
  schema: number;
  total: number;
  passed: number;
  failed: number;
  cases: RegressionCaseReport[];
}

/** A fixture known to fail on `main`, with the signature it fails with. */
export interface BaselineKnownFailure {
  fixture: string;
  signature: string;
  /** Why it is accepted, ideally with a tracking issue. */
  reason?: string;
}

/** Checked-in baseline: `contracts/crashlab-core/regression-baseline.json`. */
export interface RegressionBaseline {
  schema: number;
  knownFailures: BaselineKnownFailure[];
}

export type FixtureOutcome = 'pass' | 'fail' | 'error';

/**
 * - `new`        failing, and not a known failure with this signature (blocking)
 * - `recurring`  failing with the signature recorded in the baseline
 * - `fixed`      in the baseline but passing now — remove it from the baseline
 * - `unchanged`  passing and not in the baseline
 */
export type FixtureClassification = 'new' | 'recurring' | 'fixed' | 'unchanged';

export const FIXTURE_CLASSIFICATIONS: readonly FixtureClassification[] = [
  'new',
  'recurring',
  'fixed',
  'unchanged',
];

export interface ClassifiedFixture {
  /** Stable id: `seed-<seed_id>-<mode>`. */
  id: string;
  seedId: number;
  mode: string;
  expectedClass: string;
  actualClass: string | null;
  outcome: FixtureOutcome;
  classification: FixtureClassification;
  /** Signature recorded in the baseline, when it differs from the actual one. */
  baselineSignature: string | null;
  error: string | null;
}

export interface ClassificationDeltas {
  new: number;
  recurring: number;
  fixed: number;
  unchanged: number;
  total: number;
  /** `new` fixtures fail the gate. */
  blocking: number;
}

export type CiEvent = 'pull_request' | 'push' | 'schedule' | 'workflow_dispatch';

export const CI_EVENTS: readonly CiEvent[] = ['pull_request', 'push', 'schedule', 'workflow_dispatch'];

export interface CiArtifactLink {
  name: string;
  url: string;
}

/** Payload posted to the ingest API; one per (commit, suite run). */
export interface CiRegressionResult {
  schemaVersion: number;
  /** `owner/repo`. */
  repository: string;
  commitSha: string;
  prNumber: number | null;
  ref: string | null;
  event: CiEvent;
  /** `<run_id>-<run_attempt>`, so a re-run is a distinct suite run. */
  suiteRunId: string;
  runUrl: string | null;
  completedAt: string;
  fixtures: ClassifiedFixture[];
  artifacts: CiArtifactLink[];
}
