import {
  isActiveStatus,
  isTerminalStatus,
  deriveTestCaseStatus,
  summariseCIRun,
  validateJobConfig,
  validateJobResult,
  findMismatchedJobs,
  allJobsSameAuthMode,
  CIJobConfig,
  CIJobResult,
  CIReplayTestCase,
} from './integrate-ci-integration-for-run-replay-tests-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<CIJobConfig> = {}): CIJobConfig {
  return { jobId: 'job-1', runner: 'ubuntu-2404', authMode: 'Enforce', ...overrides };
}

function makeResult(overrides: Partial<CIJobResult> = {}): CIJobResult {
  return {
    jobId: 'job-1',
    replayRunId: 'run-replay-1',
    signatureMatch: true,
    durationMs: 120,
    ...overrides,
  };
}

function makeCase(overrides: Partial<CIReplayTestCase> = {}): CIReplayTestCase {
  return {
    id: 'tc-1',
    label: 'Test case',
    description: 'desc',
    sourceRunId: 'run-1000',
    sourceSignature: 'abc123',
    jobs: [makeJob()],
    status: 'idle',
    ...overrides,
  };
}

// ── isActiveStatus ────────────────────────────────────────────────────────────

function testIsActiveStatus(): void {
  assert(isActiveStatus('queued'), 'queued should be active');
  assert(isActiveStatus('running'), 'running should be active');
  assert(!isActiveStatus('idle'), 'idle should not be active');
  assert(!isActiveStatus('passed'), 'passed should not be active');
  assert(!isActiveStatus('failed'), 'failed should not be active');
  assert(!isActiveStatus('timeout'), 'timeout should not be active');
  console.log('✓ testIsActiveStatus passed');
}

// ── isTerminalStatus ──────────────────────────────────────────────────────────

function testIsTerminalStatus(): void {
  assert(isTerminalStatus('passed'), 'passed should be terminal');
  assert(isTerminalStatus('failed'), 'failed should be terminal');
  assert(isTerminalStatus('timeout'), 'timeout should be terminal');
  assert(!isTerminalStatus('idle'), 'idle should not be terminal');
  assert(!isTerminalStatus('queued'), 'queued should not be terminal');
  assert(!isTerminalStatus('running'), 'running should not be terminal');
  console.log('✓ testIsTerminalStatus passed');
}

// ── deriveTestCaseStatus ──────────────────────────────────────────────────────

function testDeriveTestCaseStatus_allMatch(): void {
  const results = [makeResult({ signatureMatch: true }), makeResult({ jobId: 'job-2', signatureMatch: true })];
  assert(deriveTestCaseStatus(results) === 'passed', 'all matching should be passed');
  console.log('✓ testDeriveTestCaseStatus_allMatch passed');
}

function testDeriveTestCaseStatus_anyMismatch(): void {
  const results = [makeResult({ signatureMatch: true }), makeResult({ jobId: 'job-2', signatureMatch: false, errorMessage: 'mismatch' })];
  assert(deriveTestCaseStatus(results) === 'failed', 'any mismatch should be failed');
  console.log('✓ testDeriveTestCaseStatus_anyMismatch passed');
}

function testDeriveTestCaseStatus_empty(): void {
  assert(deriveTestCaseStatus([]) === 'failed', 'empty results should be failed');
  console.log('✓ testDeriveTestCaseStatus_empty passed');
}

// ── summariseCIRun ────────────────────────────────────────────────────────────

function testSummariseCIRun(): void {
  const cases: CIReplayTestCase[] = [
    makeCase({ id: 'a', status: 'passed' }),
    makeCase({ id: 'b', status: 'passed' }),
    makeCase({ id: 'c', status: 'failed' }),
    makeCase({ id: 'd', status: 'running' }),
    makeCase({ id: 'e', status: 'idle' }),
    makeCase({ id: 'f', status: 'timeout' }),
  ];
  const s = summariseCIRun(cases);
  assert(s.total === 6, 'total should be 6');
  assert(s.passed === 2, 'passed should be 2');
  assert(s.failed === 2, 'failed + timeout should count as failed (2)');
  assert(s.running === 1, 'running should be 1');
  assert(s.idle === 1, 'idle should be 1');
  console.log('✓ testSummariseCIRun passed');
}

function testSummariseCIRun_empty(): void {
  const s = summariseCIRun([]);
  assert(s.total === 0, 'empty total should be 0');
  assert(s.passed === 0, 'empty passed should be 0');
  console.log('✓ testSummariseCIRun_empty passed');
}

// ── validateJobConfig ─────────────────────────────────────────────────────────

function testValidateJobConfig_valid(): void {
  const r = validateJobConfig(makeJob());
  assert(r.isValid, 'valid job config should pass');
  assert(r.errors.length === 0, 'valid job config should have no errors');
  console.log('✓ testValidateJobConfig_valid passed');
}

function testValidateJobConfig_missingJobId(): void {
  const r = validateJobConfig(makeJob({ jobId: '' }));
  assert(!r.isValid, 'empty jobId should be invalid');
  assert(r.errors.includes('jobId is required'), 'should flag missing jobId');
  console.log('✓ testValidateJobConfig_missingJobId passed');
}

function testValidateJobConfig_invalidAuthMode(): void {
  const r = validateJobConfig(makeJob({ authMode: 'Unknown' as never }));
  assert(!r.isValid, 'invalid authMode should fail');
  assert(r.errors.some(e => e.includes('authMode')), 'should flag invalid authMode');
  console.log('✓ testValidateJobConfig_invalidAuthMode passed');
}

// ── validateJobResult ─────────────────────────────────────────────────────────

function testValidateJobResult_valid(): void {
  const r = validateJobResult(makeResult());
  assert(r.isValid, 'valid result should pass');
  console.log('✓ testValidateJobResult_valid passed');
}

function testValidateJobResult_mismatchWithoutError(): void {
  const r = validateJobResult(makeResult({ signatureMatch: false, errorMessage: undefined }));
  assert(!r.isValid, 'mismatch without errorMessage should be invalid');
  assert(r.errors.includes('errorMessage is required when signatureMatch is false'), 'should flag missing errorMessage');
  console.log('✓ testValidateJobResult_mismatchWithoutError passed');
}

function testValidateJobResult_negativeDuration(): void {
  const r = validateJobResult(makeResult({ durationMs: -1 }));
  assert(!r.isValid, 'negative durationMs should be invalid');
  console.log('✓ testValidateJobResult_negativeDuration passed');
}

// ── findMismatchedJobs ────────────────────────────────────────────────────────

function testFindMismatchedJobs(): void {
  const tc = makeCase({
    results: [
      makeResult({ jobId: 'job-1', signatureMatch: true }),
      makeResult({ jobId: 'job-2', signatureMatch: false, errorMessage: 'diverged' }),
    ],
  });
  const mismatched = findMismatchedJobs(tc);
  assert(mismatched.length === 1, 'should find 1 mismatched job');
  assert(mismatched[0].jobId === 'job-2', 'should be job-2');
  console.log('✓ testFindMismatchedJobs passed');
}

function testFindMismatchedJobs_noResults(): void {
  const tc = makeCase({ results: undefined });
  assert(findMismatchedJobs(tc).length === 0, 'no results should return empty');
  console.log('✓ testFindMismatchedJobs_noResults passed');
}

// ── allJobsSameAuthMode ───────────────────────────────────────────────────────

function testAllJobsSameAuthMode(): void {
  const same = [makeJob({ authMode: 'Enforce' }), makeJob({ jobId: 'j2', authMode: 'Enforce' })];
  assert(allJobsSameAuthMode(same), 'same auth modes should return true');

  const mixed = [makeJob({ authMode: 'Enforce' }), makeJob({ jobId: 'j2', authMode: 'Record' })];
  assert(!allJobsSameAuthMode(mixed), 'mixed auth modes should return false');

  assert(allJobsSameAuthMode([]), 'empty jobs should return true');
  console.log('✓ testAllJobsSameAuthMode passed');
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running CI Integration for Run Replay Tests Utils Tests...\n');
  try {
    testIsActiveStatus();
    testIsTerminalStatus();
    testDeriveTestCaseStatus_allMatch();
    testDeriveTestCaseStatus_anyMismatch();
    testDeriveTestCaseStatus_empty();
    testSummariseCIRun();
    testSummariseCIRun_empty();
    testValidateJobConfig_valid();
    testValidateJobConfig_missingJobId();
    testValidateJobConfig_invalidAuthMode();
    testValidateJobResult_valid();
    testValidateJobResult_mismatchWithoutError();
    testValidateJobResult_negativeDuration();
    testFindMismatchedJobs();
    testFindMismatchedJobs_noResults();
    testAllJobsSameAuthMode();
    console.log('\n✅ All CI Integration for Run Replay Tests utils tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
