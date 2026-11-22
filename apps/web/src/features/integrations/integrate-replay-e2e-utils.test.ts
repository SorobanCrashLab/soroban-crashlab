/**
 * Tests for Issue #410 – Integrate: Replay end-to-end integration test
 *
 * Validates the pure utility functions in integrate-replay-e2e-utils.ts.
 * Compiled and executed via `npm run test` using tsc + node.
 */

import {
  ReplayTestCase,
  ReplayTestStatus,
  deriveReplayStatus,
  buildReplayResult,
  computeReplaySuiteSummary,
  computePassRate,
  isReplaySuiteComplete,
} from './integrate-replay-e2e-utils';

// ── Test utilities ────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeCase(id: string, status: ReplayTestStatus, sig = 'abc123'): ReplayTestCase {
  return {
    id,
    label: `Case ${id}`,
    description: `Replay test case ${id}`,
    sourceRun: { id: `run-${id}`, area: 'auth', severity: 'medium', status: 'failed', signature: sig },
    status,
  };
}

// ── deriveReplayStatus ────────────────────────────────────────────────────────

function testDeriveReplayStatusPassedWhenBothTrue(): void {
  assert(
    deriveReplayStatus(true, true) === 'passed',
    'both true → status should be "passed"',
  );

  console.log('✓ testDeriveReplayStatusPassedWhenBothTrue passed');
}

function testDeriveReplayStatusFailedWhenSignatureMismatch(): void {
  assert(
    deriveReplayStatus(false, true) === 'failed',
    'signature mismatch → status should be "failed"',
  );

  console.log('✓ testDeriveReplayStatusFailedWhenSignatureMismatch passed');
}

function testDeriveReplayStatusFailedWhenAuthInconsistent(): void {
  assert(
    deriveReplayStatus(true, false) === 'failed',
    'auth inconsistent → status should be "failed"',
  );

  console.log('✓ testDeriveReplayStatusFailedWhenAuthInconsistent passed');
}

function testDeriveReplayStatusFailedWhenBothFalse(): void {
  assert(
    deriveReplayStatus(false, false) === 'failed',
    'both false → status should be "failed"',
  );

  console.log('✓ testDeriveReplayStatusFailedWhenBothFalse passed');
}

// ── buildReplayResult ─────────────────────────────────────────────────────────

function testBuildReplayResultMatchingSignatures(): void {
  const result = buildReplayResult(
    'run-1023', 'replay-run-1023-abc',
    'a3f8c1d2', 'a3f8c1d2',
    true, 1200,
  );

  assert(result.sourceRunId === 'run-1023',           'sourceRunId must be preserved');
  assert(result.replayRunId === 'replay-run-1023-abc', 'replayRunId must be preserved');
  assert(result.signatureMatch === true,               'identical signatures → signatureMatch true');
  assert(result.authModeConsistent === true,           'authModeConsistent must be preserved');
  assert(result.durationMs === 1200,                   'durationMs must be preserved');
  assert(result.originalSignature === 'a3f8c1d2',      'originalSignature must be preserved');
  assert(result.replayedSignature === 'a3f8c1d2',      'replayedSignature must be preserved');

  console.log('✓ testBuildReplayResultMatchingSignatures passed');
}

function testBuildReplayResultMismatchedSignatures(): void {
  const result = buildReplayResult(
    'run-99', 'replay-run-99-xyz',
    'aaaa1111', 'bbbb2222',
    true, 500,
  );

  assert(result.signatureMatch === false, 'different signatures → signatureMatch false');

  console.log('✓ testBuildReplayResultMismatchedSignatures passed');
}

function testBuildReplayResultZeroDuration(): void {
  const result = buildReplayResult('r1', 'r1-replay', 'sig', 'sig', true, 0);
  assert(result.durationMs === 0, 'zero duration must be recorded faithfully');

  console.log('✓ testBuildReplayResultZeroDuration passed');
}

// ── computeReplaySuiteSummary ─────────────────────────────────────────────────

function testReplaySummaryEmpty(): void {
  const s = computeReplaySuiteSummary([]);

  assert(s.total === 0,   'empty: total 0');
  assert(s.passed === 0,  'empty: passed 0');
  assert(s.failed === 0,  'empty: failed 0');
  assert(s.running === 0, 'empty: running 0');
  assert(s.idle === 0,    'empty: idle 0');

  console.log('✓ testReplaySummaryEmpty passed');
}

function testReplaySummaryMixed(): void {
  const cases: ReplayTestCase[] = [
    makeCase('1', 'passed'),
    makeCase('2', 'passed'),
    makeCase('3', 'failed'),
    makeCase('4', 'running'),
    makeCase('5', 'idle'),
  ];

  const s = computeReplaySuiteSummary(cases);

  assert(s.total === 5,   'mixed: total 5');
  assert(s.passed === 2,  'mixed: passed 2');
  assert(s.failed === 1,  'mixed: failed 1');
  assert(s.running === 1, 'mixed: running 1');
  assert(s.idle === 1,    'mixed: idle 1');

  console.log('✓ testReplaySummaryMixed passed');
}

// ── computePassRate ───────────────────────────────────────────────────────────

function testPassRateEmptyIsZero(): void {
  assert(computePassRate([]) === 0, 'empty suite pass rate should be 0');

  console.log('✓ testPassRateEmptyIsZero passed');
}

function testPassRate100Percent(): void {
  const cases = [makeCase('1', 'passed'), makeCase('2', 'passed')];
  assert(computePassRate(cases) === 100, 'all-passed → 100% pass rate');

  console.log('✓ testPassRate100Percent passed');
}

function testPassRate0Percent(): void {
  const cases = [makeCase('1', 'failed'), makeCase('2', 'failed')];
  assert(computePassRate(cases) === 0, 'all-failed → 0% pass rate');

  console.log('✓ testPassRate0Percent passed');
}

function testPassRatePartial(): void {
  const cases = [
    makeCase('1', 'passed'),
    makeCase('2', 'passed'),
    makeCase('3', 'failed'),
    makeCase('4', 'failed'),
  ];
  assert(computePassRate(cases) === 50, '2 of 4 passed → 50% pass rate');

  console.log('✓ testPassRatePartial passed');
}

// ── isReplaySuiteComplete ─────────────────────────────────────────────────────

function testSuiteCompleteEmpty(): void {
  assert(!isReplaySuiteComplete([]), 'empty suite should not be complete');

  console.log('✓ testSuiteCompleteEmpty passed');
}

function testSuiteCompleteWithRunning(): void {
  const cases = [makeCase('1', 'passed'), makeCase('2', 'running')];
  assert(!isReplaySuiteComplete(cases), 'suite with running case should not be complete');

  console.log('✓ testSuiteCompleteWithRunning passed');
}

function testSuiteCompleteWithIdle(): void {
  const cases = [makeCase('1', 'passed'), makeCase('2', 'idle')];
  assert(!isReplaySuiteComplete(cases), 'suite with idle case should not be complete');

  console.log('✓ testSuiteCompleteWithIdle passed');
}

function testSuiteCompleteAllTerminal(): void {
  const cases = [makeCase('1', 'passed'), makeCase('2', 'failed'), makeCase('3', 'passed')];
  assert(isReplaySuiteComplete(cases), 'all-terminal suite should be complete');

  console.log('✓ testSuiteCompleteAllTerminal passed');
}

// ── Acceptance path (end-to-end) ──────────────────────────────────────────────

function testAcceptancePath_authReplayPassesWhenSignaturesMatch(): void {
  // Simulates the primary acceptance path: a critical auth failure is
  // replayed and produces the same signature → test passes.
  const originalSig = 'a3f8c1d2e4b56789';

  const result = buildReplayResult(
    'run-1023', 'replay-run-1023-test',
    originalSig, originalSig,
    true, 980,
  );

  const status = deriveReplayStatus(result.signatureMatch, result.authModeConsistent);

  assert(status === 'passed',               'acceptance: auth replay should pass');
  assert(result.signatureMatch === true,    'acceptance: signatures should match');
  assert(result.authModeConsistent === true, 'acceptance: auth mode should be consistent');

  console.log('✓ testAcceptancePath_authReplayPassesWhenSignaturesMatch passed');
}

function testAcceptancePath_replayFailsWhenSignaturesDiffer(): void {
  // Edge case: replay produces a different signature (non-deterministic behaviour).
  const result = buildReplayResult(
    'run-1019', 'replay-run-1019-test',
    'b7e920a1', 'ffffffff', // diverged signature
    true, 700,
  );

  const status = deriveReplayStatus(result.signatureMatch, result.authModeConsistent);

  assert(status === 'failed',             'non-deterministic replay should fail');
  assert(result.signatureMatch === false, 'diverged signatures should not match');

  console.log('✓ testAcceptancePath_replayFailsWhenSignaturesDiffer passed');
}

// ── Run all ───────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Replay End-to-End Integration Test utility tests…\n');

  try {
    testDeriveReplayStatusPassedWhenBothTrue();
    testDeriveReplayStatusFailedWhenSignatureMismatch();
    testDeriveReplayStatusFailedWhenAuthInconsistent();
    testDeriveReplayStatusFailedWhenBothFalse();
    testBuildReplayResultMatchingSignatures();
    testBuildReplayResultMismatchedSignatures();
    testBuildReplayResultZeroDuration();
    testReplaySummaryEmpty();
    testReplaySummaryMixed();
    testPassRateEmptyIsZero();
    testPassRate100Percent();
    testPassRate0Percent();
    testPassRatePartial();
    testSuiteCompleteEmpty();
    testSuiteCompleteWithRunning();
    testSuiteCompleteWithIdle();
    testSuiteCompleteAllTerminal();
    testAcceptancePath_authReplayPassesWhenSignaturesMatch();
    testAcceptancePath_replayFailsWhenSignaturesDiffer();

    console.log('\n✅ All Replay End-to-End Integration Test utility tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

export { makeCase, runAllTests };

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
