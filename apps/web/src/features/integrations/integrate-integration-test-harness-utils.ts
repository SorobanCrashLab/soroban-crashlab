/**
 * Issue #408 – Integrate: Integration test harness for UI flows
 *
 * Pure utility functions for the UI flow integration test harness.
 * These are extracted from the React component so they can be tested
 * independently without a DOM or React environment.
 */

export type TestStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface UIFlowTest {
  id: string;
  name: string;
  description: string;
  steps: string[];
  status: TestStatus;
  durationMs?: number;
  error?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  idle: number;
}

/**
 * Computes aggregate counts for a set of UI flow tests.
 * Returns zeroes for an empty array rather than throwing.
 */
export function computeTestSuiteSummary(tests: UIFlowTest[]): TestSuiteSummary {
  const summary: TestSuiteSummary = { total: 0, passed: 0, failed: 0, running: 0, idle: 0 };
  for (const t of tests) {
    summary.total += 1;
    switch (t.status) {
      case 'passed':  summary.passed  += 1; break;
      case 'failed':  summary.failed  += 1; break;
      case 'running': summary.running += 1; break;
      default:        summary.idle    += 1; break;
    }
  }
  return summary;
}

/**
 * Returns true only when every test has reached a terminal state
 * (passed or failed) — i.e. the suite run is complete.
 */
export function isTestSuiteComplete(tests: UIFlowTest[]): boolean {
  if (tests.length === 0) return false;
  return tests.every((t) => t.status === 'passed' || t.status === 'failed');
}

/**
 * Returns true when any test is currently in the 'running' state.
 */
export function hasRunningTests(tests: UIFlowTest[]): boolean {
  return tests.some((t) => t.status === 'running');
}

/**
 * Returns a human-readable label for a given TestStatus.
 */
export function getTestStatusLabel(status: TestStatus): string {
  switch (status) {
    case 'passed':  return 'Passed';
    case 'failed':  return 'Failed';
    case 'running': return 'Running';
    default:        return 'Idle';
  }
}

/**
 * Resets all tests in the array back to the 'idle' state, clearing
 * any stored duration or error information.
 */
export function resetTestSuite(tests: UIFlowTest[]): UIFlowTest[] {
  return tests.map((t) => ({
    ...t,
    status: 'idle' as TestStatus,
    durationMs: undefined,
    error: undefined,
  }));
}
