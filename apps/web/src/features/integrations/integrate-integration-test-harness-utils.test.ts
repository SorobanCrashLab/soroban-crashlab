/**
 * Tests for Issue #408 – Integrate: Integration test harness for UI flows
 *
 * Validates the pure utility functions in integrate-integration-test-harness-utils.ts.
 * Compiled and executed via `npm run test` using tsc + node.
 */

import {
  UIFlowTest,
  TestStatus,
  computeTestSuiteSummary,
  isTestSuiteComplete,
  hasRunningTests,
  getTestStatusLabel,
  resetTestSuite,
} from './integrate-integration-test-harness-utils';

// ── Test utilities ────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeTest(id: string, status: TestStatus, overrides: Partial<UIFlowTest> = {}): UIFlowTest {
  return {
    id,
    name: `Test ${id}`,
    description: `Description for test ${id}`,
    steps: ['step 1', 'step 2'],
    status,
    ...overrides,
  };
}

// ── computeTestSuiteSummary ───────────────────────────────────────────────────

function testSummaryEmpty(): void {
  const summary = computeTestSuiteSummary([]);

  assert(summary.total === 0,   'empty: total should be 0');
  assert(summary.passed === 0,  'empty: passed should be 0');
  assert(summary.failed === 0,  'empty: failed should be 0');
  assert(summary.running === 0, 'empty: running should be 0');
  assert(summary.idle === 0,    'empty: idle should be 0');

  console.log('✓ testSummaryEmpty passed');
}

function testSummaryAllIdle(): void {
  const tests = [
    makeTest('t1', 'idle'),
    makeTest('t2', 'idle'),
    makeTest('t3', 'idle'),
  ];

  const summary = computeTestSuiteSummary(tests);

  assert(summary.total === 3,   'all-idle: total should be 3');
  assert(summary.idle === 3,    'all-idle: idle should be 3');
  assert(summary.passed === 0,  'all-idle: passed should be 0');
  assert(summary.failed === 0,  'all-idle: failed should be 0');
  assert(summary.running === 0, 'all-idle: running should be 0');

  console.log('✓ testSummaryAllIdle passed');
}

function testSummaryMixedStatuses(): void {
  const tests = [
    makeTest('t1', 'passed'),
    makeTest('t2', 'passed'),
    makeTest('t3', 'failed'),
    makeTest('t4', 'running'),
    makeTest('t5', 'idle'),
  ];

  const summary = computeTestSuiteSummary(tests);

  assert(summary.total === 5,   'mixed: total should be 5');
  assert(summary.passed === 2,  'mixed: passed should be 2');
  assert(summary.failed === 1,  'mixed: failed should be 1');
  assert(summary.running === 1, 'mixed: running should be 1');
  assert(summary.idle === 1,    'mixed: idle should be 1');

  console.log('✓ testSummaryMixedStatuses passed');
}

function testSummaryAllPassed(): void {
  const tests = [makeTest('a', 'passed'), makeTest('b', 'passed')];
  const summary = computeTestSuiteSummary(tests);

  assert(summary.total === 2,  'all-passed: total should be 2');
  assert(summary.passed === 2, 'all-passed: passed should be 2');
  assert(summary.failed === 0, 'all-passed: failed should be 0');

  console.log('✓ testSummaryAllPassed passed');
}

// ── isTestSuiteComplete ───────────────────────────────────────────────────────

function testSuiteCompleteReturnsFalseForEmpty(): void {
  assert(!isTestSuiteComplete([]), 'empty suite should not be complete');

  console.log('✓ testSuiteCompleteReturnsFalseForEmpty passed');
}

function testSuiteCompleteReturnsFalseWhenIdleExists(): void {
  const tests = [makeTest('t1', 'passed'), makeTest('t2', 'idle')];
  assert(!isTestSuiteComplete(tests), 'suite with idle test should not be complete');

  console.log('✓ testSuiteCompleteReturnsFalseWhenIdleExists passed');
}

function testSuiteCompleteReturnsFalseWhenRunningExists(): void {
  const tests = [makeTest('t1', 'passed'), makeTest('t2', 'running')];
  assert(!isTestSuiteComplete(tests), 'suite with running test should not be complete');

  console.log('✓ testSuiteCompleteReturnsFalseWhenRunningExists passed');
}

function testSuiteCompleteReturnsTrueWhenAllTerminal(): void {
  const tests = [makeTest('t1', 'passed'), makeTest('t2', 'failed'), makeTest('t3', 'passed')];
  assert(isTestSuiteComplete(tests), 'all-terminal suite should be complete');

  console.log('✓ testSuiteCompleteReturnsTrueWhenAllTerminal passed');
}

// ── hasRunningTests ───────────────────────────────────────────────────────────

function testHasRunningReturnsFalseForEmpty(): void {
  assert(!hasRunningTests([]), 'empty suite should have no running tests');

  console.log('✓ testHasRunningReturnsFalseForEmpty passed');
}

function testHasRunningReturnsTrueWhenRunning(): void {
  const tests = [makeTest('t1', 'idle'), makeTest('t2', 'running')];
  assert(hasRunningTests(tests), 'suite should report running tests');

  console.log('✓ testHasRunningReturnsTrueWhenRunning passed');
}

function testHasRunningReturnsFalseWhenAllIdle(): void {
  const tests = [makeTest('t1', 'idle'), makeTest('t2', 'passed')];
  assert(!hasRunningTests(tests), 'suite with no running tests should return false');

  console.log('✓ testHasRunningReturnsFalseWhenAllIdle passed');
}

// ── getTestStatusLabel ────────────────────────────────────────────────────────

function testStatusLabels(): void {
  assert(getTestStatusLabel('passed')  === 'Passed',  'passed label should be "Passed"');
  assert(getTestStatusLabel('failed')  === 'Failed',  'failed label should be "Failed"');
  assert(getTestStatusLabel('running') === 'Running', 'running label should be "Running"');
  assert(getTestStatusLabel('idle')    === 'Idle',    'idle label should be "Idle"');

  console.log('✓ testStatusLabels passed');
}

// ── resetTestSuite ────────────────────────────────────────────────────────────

function testResetClearsStatusAndMetadata(): void {
  const tests: UIFlowTest[] = [
    makeTest('t1', 'passed', { durationMs: 1200 }),
    makeTest('t2', 'failed', { error: 'timeout', durationMs: 800 }),
    makeTest('t3', 'running'),
  ];

  const reset = resetTestSuite(tests);

  assert(reset.length === 3, 'reset suite should have same count');
  for (const t of reset) {
    assert(t.status === 'idle',         `${t.id}: status should be idle after reset`);
    assert(t.durationMs === undefined,  `${t.id}: durationMs should be cleared after reset`);
    assert(t.error === undefined,       `${t.id}: error should be cleared after reset`);
  }

  // Original array must not be mutated
  assert(tests[0].status === 'passed', 'reset should not mutate original array');

  console.log('✓ testResetClearsStatusAndMetadata passed');
}

function testResetOnEmptyIsNoOp(): void {
  const result = resetTestSuite([]);
  assert(result.length === 0, 'reset of empty suite should return empty array');

  console.log('✓ testResetOnEmptyIsNoOp passed');
}

// ── Edge case: single test suite ─────────────────────────────────────────────

function testSingleTestSuitePassedIsComplete(): void {
  const tests = [makeTest('only', 'passed')];
  assert(isTestSuiteComplete(tests), 'single passed test should be a complete suite');
  assert(!hasRunningTests(tests),    'single passed test should have no running tests');

  const summary = computeTestSuiteSummary(tests);
  assert(summary.total === 1,  'single test: total should be 1');
  assert(summary.passed === 1, 'single test: passed should be 1');

  console.log('✓ testSingleTestSuitePassedIsComplete passed');
}

// ── Run all ───────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Integration Test Harness for UI Flows utility tests…\n');

  try {
    testSummaryEmpty();
    testSummaryAllIdle();
    testSummaryMixedStatuses();
    testSummaryAllPassed();
    testSuiteCompleteReturnsFalseForEmpty();
    testSuiteCompleteReturnsFalseWhenIdleExists();
    testSuiteCompleteReturnsFalseWhenRunningExists();
    testSuiteCompleteReturnsTrueWhenAllTerminal();
    testHasRunningReturnsFalseForEmpty();
    testHasRunningReturnsTrueWhenRunning();
    testHasRunningReturnsFalseWhenAllIdle();
    testStatusLabels();
    testResetClearsStatusAndMetadata();
    testResetOnEmptyIsNoOp();
    testSingleTestSuitePassedIsComplete();

    console.log('\n✅ All Integration Test Harness for UI Flows utility tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

export {
  makeTest,
  runAllTests,
};

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
