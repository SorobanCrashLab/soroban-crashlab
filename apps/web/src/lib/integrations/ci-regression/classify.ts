/**
 * Classifies a regression replay against the checked-in baseline (#1891).
 *
 * Pure and deterministic: the same report and baseline always produce the same
 * fixtures in the same order, so summaries diff cleanly between runs.
 */

import {
  FIXTURE_CLASSIFICATIONS,
  type ClassificationDeltas,
  type ClassifiedFixture,
  type FixtureClassification,
  type FixtureOutcome,
  type RegressionBaseline,
  type RegressionCaseReport,
  type RegressionSuiteReport,
} from './types';

export function fixtureId(row: Pick<RegressionCaseReport, 'seed_id' | 'mode'>): string {
  return `seed-${row.seed_id}-${row.mode}`;
}

function outcomeOf(row: RegressionCaseReport): FixtureOutcome {
  if (row.passed) return 'pass';
  return row.error !== null ? 'error' : 'fail';
}

/** The signature a failing fixture is compared on: its actual class, or `error`. */
export function signatureOf(row: RegressionCaseReport): string {
  return row.actual_failure_class ?? 'error';
}

/** Code-unit comparison: locale-independent, so ordering is identical everywhere. */
export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

const CLASSIFICATION_RANK: Record<FixtureClassification, number> = {
  new: 0,
  recurring: 1,
  fixed: 2,
  unchanged: 3,
};

/** Blocking first, then by id. */
export function sortFixtures(fixtures: readonly ClassifiedFixture[]): ClassifiedFixture[] {
  return [...fixtures].sort(
    (a, b) =>
      CLASSIFICATION_RANK[a.classification] - CLASSIFICATION_RANK[b.classification] ||
      compareIds(a.id, b.id),
  );
}

export function classifyReport(
  report: RegressionSuiteReport,
  baseline: RegressionBaseline,
): ClassifiedFixture[] {
  const known = new Map(baseline.knownFailures.map((k) => [k.fixture, k.signature]));
  const byId = new Map<string, ClassifiedFixture>();

  for (const row of report.cases) {
    const id = fixtureId(row);
    // A suite may list the same seed twice; the first row wins so the result
    // does not depend on how many copies were loaded.
    if (byId.has(id)) continue;

    const outcome = outcomeOf(row);
    const baselineSignature = known.get(id) ?? null;
    let classification: FixtureClassification;
    if (outcome === 'pass') {
      classification = baselineSignature === null ? 'unchanged' : 'fixed';
    } else {
      classification = baselineSignature === signatureOf(row) ? 'recurring' : 'new';
    }

    byId.set(id, {
      id,
      seedId: row.seed_id,
      mode: row.mode,
      expectedClass: row.expected_failure_class,
      actualClass: row.actual_failure_class,
      outcome,
      classification,
      baselineSignature:
        baselineSignature !== null && baselineSignature !== signatureOf(row) ? baselineSignature : null,
      error: row.error,
    });
  }

  return sortFixtures([...byId.values()]);
}

export function summarizeDeltas(fixtures: readonly ClassifiedFixture[]): ClassificationDeltas {
  const counts: Record<FixtureClassification, number> = { new: 0, recurring: 0, fixed: 0, unchanged: 0 };
  for (const fixture of fixtures) counts[fixture.classification] += 1;
  return {
    ...counts,
    total: fixtures.length,
    blocking: counts.new,
  };
}

export function isFixtureClassification(value: unknown): value is FixtureClassification {
  return typeof value === 'string' && (FIXTURE_CLASSIFICATIONS as readonly string[]).includes(value);
}
