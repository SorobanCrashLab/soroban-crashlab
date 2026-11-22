/**
 * Issue #254 – Integrate: Database migration integration tests
 *
 * Pure utility functions for the DatabaseMigrationIntegrationTests module.
 * Extracted to allow deterministic unit testing without React dependency.
 */

export type MigrationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface MigrationTestCase {
  id: string;
  name: string;
  fromVersion: number;
  toVersion: number;
  status: MigrationStatus;
  durationMs?: number;
  errorMessage?: string;
  affectedRecords?: number;
}

export interface MigrationSuite {
  id: string;
  label: string;
  description: string;
  cases: MigrationTestCase[];
}

export interface SuiteScore {
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  pending: number;
  total: number;
}

/** Returns pass/fail/total tallies for a single suite. */
export function computeSuiteScore(suite: MigrationSuite): SuiteScore {
  const counts: SuiteScore = { passed: 0, failed: 0, skipped: 0, running: 0, pending: 0, total: suite.cases.length };
  for (const c of suite.cases) {
    counts[c.status]++;
  }
  return counts;
}

/** Aggregates all cases across suites into a single score. */
export function computeAggregateScore(suites: MigrationSuite[]): SuiteScore {
  const empty: SuiteScore = { passed: 0, failed: 0, skipped: 0, running: 0, pending: 0, total: 0 };
  return suites.reduce<SuiteScore>((acc, suite) => {
    const s = computeSuiteScore(suite);
    return {
      passed: acc.passed + s.passed,
      failed: acc.failed + s.failed,
      skipped: acc.skipped + s.skipped,
      running: acc.running + s.running,
      pending: acc.pending + s.pending,
      total: acc.total + s.total,
    };
  }, empty);
}

/** Returns true if a migration path is a forward migration (toVersion > fromVersion). */
export function isForwardMigration(tc: MigrationTestCase): boolean {
  return tc.toVersion > tc.fromVersion;
}

/** Returns true if a migration path is a rollback (toVersion < fromVersion). */
export function isRollback(tc: MigrationTestCase): boolean {
  return tc.toVersion < tc.fromVersion;
}

/** Returns true if a migration is a no-op re-import (same version). */
export function isIdempotentReimport(tc: MigrationTestCase): boolean {
  return tc.toVersion === tc.fromVersion;
}

export interface MigrationValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Validates that a MigrationTestCase has all required observable fields. */
export function validateMigrationTestCase(tc: MigrationTestCase): MigrationValidationResult {
  const errors: string[] = [];

  if (!tc.id) errors.push('Test case ID is required');
  if (!tc.name) errors.push('Test case name is required');
  if (tc.fromVersion < 0) errors.push('fromVersion must be >= 0');
  if (tc.toVersion < 0) errors.push('toVersion must be >= 0');

  const validStatuses: MigrationStatus[] = ['pending', 'running', 'passed', 'failed', 'skipped'];
  if (!validStatuses.includes(tc.status)) {
    errors.push(`Invalid status: ${tc.status}`);
  }

  if (tc.status === 'failed' && !tc.errorMessage) {
    errors.push('errorMessage is required when status is failed');
  }

  if (tc.durationMs !== undefined && tc.durationMs < 0) {
    errors.push('durationMs must be >= 0');
  }

  if (tc.affectedRecords !== undefined && tc.affectedRecords < 0) {
    errors.push('affectedRecords must be >= 0');
  }

  return { isValid: errors.length === 0, errors };
}

/** Returns a human-readable label for a migration path, e.g. "v1 → v2". */
export function formatMigrationPath(fromVersion: number, toVersion: number): string {
  return `v${fromVersion} → v${toVersion}`;
}
