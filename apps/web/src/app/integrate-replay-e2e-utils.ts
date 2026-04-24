/**
 * Issue #410 – Integrate: Replay end-to-end integration test
 *
 * Pure utility functions for the replay end-to-end integration test harness.
 * Extracted so they can be unit-tested independently of React and async I/O.
 */

export type ReplayTestStatus = 'idle' | 'running' | 'passed' | 'failed';

export interface ReplayTestResult {
  sourceRunId: string;
  replayRunId: string;
  signatureMatch: boolean;
  authModeConsistent: boolean;
  durationMs: number;
  originalSignature: string;
  replayedSignature: string;
}

export interface ReplayTestCase {
  id: string;
  label: string;
  description: string;
  sourceRun: { id: string; area: string; severity: string; status: string; signature: string };
  status: ReplayTestStatus;
  result?: ReplayTestResult;
}

export interface ReplaySuiteSummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  idle: number;
}

/**
 * Determines the test outcome status for a completed replay attempt.
 *
 * A replay is considered passed only when `signatureMatch` is true and
 * `authModeConsistent` is true — both conditions must hold for the test
 * to be considered reproducible.
 */
export function deriveReplayStatus(
  signatureMatch: boolean,
  authModeConsistent: boolean,
): ReplayTestStatus {
  return signatureMatch && authModeConsistent ? 'passed' : 'failed';
}

/**
 * Constructs a ReplayTestResult from the raw replay outcome values.
 */
export function buildReplayResult(
  sourceRunId: string,
  replayRunId: string,
  originalSignature: string,
  replayedSignature: string,
  authModeConsistent: boolean,
  durationMs: number,
): ReplayTestResult {
  return {
    sourceRunId,
    replayRunId,
    signatureMatch: originalSignature === replayedSignature,
    authModeConsistent,
    durationMs,
    originalSignature,
    replayedSignature,
  };
}

/**
 * Computes aggregate pass/fail counts for a replay test suite.
 */
export function computeReplaySuiteSummary(cases: ReplayTestCase[]): ReplaySuiteSummary {
  const s: ReplaySuiteSummary = { total: 0, passed: 0, failed: 0, running: 0, idle: 0 };
  for (const tc of cases) {
    s.total += 1;
    switch (tc.status) {
      case 'passed':  s.passed  += 1; break;
      case 'failed':  s.failed  += 1; break;
      case 'running': s.running += 1; break;
      default:        s.idle    += 1; break;
    }
  }
  return s;
}

/**
 * Returns the replay pass rate as a value in [0, 100].
 * Returns 0 for an empty suite to avoid division by zero.
 */
export function computePassRate(cases: ReplayTestCase[]): number {
  if (cases.length === 0) return 0;
  const passed = cases.filter((tc) => tc.status === 'passed').length;
  return Math.round((passed / cases.length) * 100);
}

/**
 * Returns true when all test cases have reached a terminal state
 * (passed or failed).
 */
export function isReplaySuiteComplete(cases: ReplayTestCase[]): boolean {
  if (cases.length === 0) return false;
  return cases.every((tc) => tc.status === 'passed' || tc.status === 'failed');
}
