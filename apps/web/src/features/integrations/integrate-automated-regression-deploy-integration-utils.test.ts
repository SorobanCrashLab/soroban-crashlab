import {
  isBusyStage,
  isTerminalStage,
  stageStepIndex,
  deriveTestsScheduled,
  buildBaselineDigest,
  summariseScenarios,
  validateResult,
  RegressionDeployScenario,
  RegressionDeployIntegrationResult,
  parseRegressionOutput,
  validateRegressionConfig,
  formatRegressionSummary,
  shouldBlockDeployment,
  CIRegressionConfig,
  RegressionSuiteResult,
} from './integrate-automated-regression-deploy-integration-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeScenario(overrides: Partial<RegressionDeployScenario> = {}): RegressionDeployScenario {
  return {
    id: 'reg-deploy-test',
    label: 'Test scenario',
    description: 'desc',
    gitRef: 'main@abc1234',
    environment: 'staging',
    suiteName: 'crashlab-regression-full',
    stage: 'idle',
    ...overrides,
  };
}

function makeResult(overrides: Partial<RegressionDeployIntegrationResult> = {}): RegressionDeployIntegrationResult {
  return {
    deploymentId: 'dep-001',
    durationMs: 1580,
    testsScheduled: 312,
    testsPassed: 312,
    baselineArtifactDigest: 'sha256:abc:baseline',
    deployedArtifactDigest: 'sha256:abc:baseline',
    digestsMatch: true,
    regressionDeltaEmpty: true,
    ...overrides,
  };
}

// ── isBusyStage ───────────────────────────────────────────────────────────────

function testIsBusyStage(): void {
  assert(isBusyStage('deploying'), 'deploying should be busy');
  assert(isBusyStage('running_regression'), 'running_regression should be busy');
  assert(isBusyStage('verifying_artifacts'), 'verifying_artifacts should be busy');
  assert(!isBusyStage('idle'), 'idle should not be busy');
  assert(!isBusyStage('passed'), 'passed should not be busy');
  assert(!isBusyStage('failed'), 'failed should not be busy');
  console.log('✓ testIsBusyStage passed');
}

// ── isTerminalStage ───────────────────────────────────────────────────────────

function testIsTerminalStage(): void {
  assert(isTerminalStage('passed'), 'passed should be terminal');
  assert(isTerminalStage('failed'), 'failed should be terminal');
  assert(!isTerminalStage('idle'), 'idle should not be terminal');
  assert(!isTerminalStage('deploying'), 'deploying should not be terminal');
  assert(!isTerminalStage('running_regression'), 'running_regression should not be terminal');
  console.log('✓ testIsTerminalStage passed');
}

// ── stageStepIndex ────────────────────────────────────────────────────────────

function testStageStepIndex(): void {
  assert(stageStepIndex('idle') === -1, 'idle should be -1');
  assert(stageStepIndex('deploying') === 0, 'deploying should be 0');
  assert(stageStepIndex('running_regression') === 1, 'running_regression should be 1');
  assert(stageStepIndex('verifying_artifacts') === 2, 'verifying_artifacts should be 2');
  assert(stageStepIndex('passed') === 3, 'passed should be 3');
  assert(stageStepIndex('failed') === 2, 'failed should be 2 (halts at verify)');
  console.log('✓ testStageStepIndex passed');
}

// ── deriveTestsScheduled ──────────────────────────────────────────────────────

function testDeriveTestsScheduled(): void {
  assert(deriveTestsScheduled('crashlab-regression-diff') === 48, 'diff suite should be 48');
  assert(deriveTestsScheduled('crashlab-regression-smoke-plus') === 120, 'smoke suite should be 120');
  assert(deriveTestsScheduled('crashlab-regression-full') === 312, 'full suite should be 312');
  assert(deriveTestsScheduled('unknown-suite') === 312, 'unknown suite should default to 312');
  console.log('✓ testDeriveTestsScheduled passed');
}

// ── buildBaselineDigest ───────────────────────────────────────────────────────

function testBuildBaselineDigest(): void {
  const digest = buildBaselineDigest('reg-deploy-main-staging');
  assert(digest.startsWith('sha256:'), 'digest should start with sha256:');
  assert(digest.endsWith(':baseline'), 'digest should end with :baseline');

  const digest2 = buildBaselineDigest('reg-deploy-main-staging');
  assert(digest === digest2, 'digest should be deterministic');

  const digest3 = buildBaselineDigest('reg-deploy-release-canary');
  assert(digest !== digest3, 'different IDs should produce different digests');
  console.log('✓ testBuildBaselineDigest passed');
}

// ── summariseScenarios ────────────────────────────────────────────────────────

function testSummariseScenarios(): void {
  const scenarios: RegressionDeployScenario[] = [
    makeScenario({ id: 'a', stage: 'passed' }),
    makeScenario({ id: 'b', stage: 'passed' }),
    makeScenario({ id: 'c', stage: 'failed' }),
    makeScenario({ id: 'd', stage: 'deploying' }),
    makeScenario({ id: 'e', stage: 'idle' }),
  ];
  const s = summariseScenarios(scenarios);
  assert(s.total === 5, 'total should be 5');
  assert(s.passed === 2, 'passed should be 2');
  assert(s.failed === 1, 'failed should be 1');
  assert(s.busy === 1, 'busy should be 1');
  assert(s.idle === 1, 'idle should be 1');
  console.log('✓ testSummariseScenarios passed');
}

function testSummariseScenarios_empty(): void {
  const s = summariseScenarios([]);
  assert(s.total === 0, 'empty total should be 0');
  console.log('✓ testSummariseScenarios_empty passed');
}

// ── validateResult ────────────────────────────────────────────────────────────

function testValidateResult_valid(): void {
  const r = validateResult(makeResult());
  assert(r.isValid, 'valid result should pass');
  assert(r.errors.length === 0, 'valid result should have no errors');
  console.log('✓ testValidateResult_valid passed');
}

function testValidateResult_passedExceedsScheduled(): void {
  const r = validateResult(makeResult({ testsScheduled: 100, testsPassed: 101 }));
  assert(!r.isValid, 'testsPassed > testsScheduled should be invalid');
  assert(r.errors.some(e => e.includes('testsPassed cannot exceed')), 'should flag testsPassed > testsScheduled');
  console.log('✓ testValidateResult_passedExceedsScheduled passed');
}

function testValidateResult_missingDeploymentId(): void {
  const r = validateResult(makeResult({ deploymentId: '' }));
  assert(!r.isValid, 'empty deploymentId should be invalid');
  assert(r.errors.includes('deploymentId is required'), 'should flag missing deploymentId');
  console.log('✓ testValidateResult_missingDeploymentId passed');
}

function testValidateResult_negativeDuration(): void {
  const r = validateResult(makeResult({ durationMs: -1 }));
  assert(!r.isValid, 'negative durationMs should be invalid');
  console.log('✓ testValidateResult_negativeDuration passed');
}

// ══════════════════════════════════════════════════════════════════════════════
// CI Regression Integration Tests (Issue #404)
// ══════════════════════════════════════════════════════════════════════════════

// ── parseRegressionOutput ─────────────────────────────────────────────────────

function testParseRegressionOutput_allPassed(): void {
  const output = `::group::Regression Suite Results
Total: 3
Passed: 3
Failed: 0
::endgroup::

✅ All regression tests passed!`;

  const result = parseRegressionOutput(output);
  assert(result.total === 3, 'total should be 3');
  assert(result.passed === 3, 'passed should be 3');
  assert(result.failed === 0, 'failed should be 0');
  assert(result.allPassed, 'allPassed should be true');
  assert(result.failures.length === 0, 'failures should be empty');
  console.log('✓ testParseRegressionOutput_allPassed passed');
}

function testParseRegressionOutput_withFailures(): void {
  const output = `::group::Regression Suite Results
Total: 5
Passed: 3
Failed: 2
::endgroup::

Failed test cases:
::error::Seed 99 (invoker): expected wrong-class, got runtime-failure
::error::Seed 42 (contract): expected auth, got budget`;

  const result = parseRegressionOutput(output);
  assert(result.total === 5, 'total should be 5');
  assert(result.passed === 3, 'passed should be 3');
  assert(result.failed === 2, 'failed should be 2');
  assert(!result.allPassed, 'allPassed should be false');
  assert(result.failures.length === 2, 'should have 2 failures');
  assert(result.failures[0].seedId === 99, 'first failure seed should be 99');
  assert(result.failures[0].expected === 'wrong-class', 'first failure expected should be wrong-class');
  assert(result.failures[0].actual === 'runtime-failure', 'first failure actual should be runtime-failure');
  assert(result.failures[1].seedId === 42, 'second failure seed should be 42');
  console.log('✓ testParseRegressionOutput_withFailures passed');
}

function testParseRegressionOutput_withError(): void {
  const output = `::group::Regression Suite Results
Total: 1
Passed: 0
Failed: 1
::endgroup::

Failed test cases:
::error::Seed 123 (none): invalid input_payload hex: invalid character`;

  const result = parseRegressionOutput(output);
  assert(result.total === 1, 'total should be 1');
  assert(result.failed === 1, 'failed should be 1');
  assert(result.failures.length === 1, 'should have 1 failure');
  assert(result.failures[0].seedId === 123, 'failure seed should be 123');
  assert(result.failures[0].error !== undefined, 'failure should have error message');
  console.log('✓ testParseRegressionOutput_withError passed');
}

function testParseRegressionOutput_emptyOutput(): void {
  const result = parseRegressionOutput('');
  assert(result.total === 0, 'total should be 0');
  assert(result.passed === 0, 'passed should be 0');
  assert(result.failed === 0, 'failed should be 0');
  assert(!result.allPassed, 'allPassed should be false when total is 0');
  console.log('✓ testParseRegressionOutput_emptyOutput passed');
}

// ── validateRegressionConfig ──────────────────────────────────────────────────

function testValidateRegressionConfig_valid(): void {
  const config: CIRegressionConfig = {
    fixturePath: 'fixtures/',
    gitRef: 'main',
    environment: 'staging',
  };
  const result = validateRegressionConfig(config);
  assert(result.isValid, 'valid config should pass');
  assert(result.errors.length === 0, 'valid config should have no errors');
  console.log('✓ testValidateRegressionConfig_valid passed');
}

function testValidateRegressionConfig_missingFixturePath(): void {
  const config: CIRegressionConfig = {
    fixturePath: '',
    gitRef: 'main',
    environment: 'staging',
  };
  const result = validateRegressionConfig(config);
  assert(!result.isValid, 'missing fixturePath should be invalid');
  assert(result.errors.includes('fixturePath is required'), 'should flag missing fixturePath');
  console.log('✓ testValidateRegressionConfig_missingFixturePath passed');
}

function testValidateRegressionConfig_missingGitRef(): void {
  const config: CIRegressionConfig = {
    fixturePath: 'fixtures/',
    gitRef: '',
    environment: 'staging',
  };
  const result = validateRegressionConfig(config);
  assert(!result.isValid, 'missing gitRef should be invalid');
  assert(result.errors.includes('gitRef is required'), 'should flag missing gitRef');
  console.log('✓ testValidateRegressionConfig_missingGitRef passed');
}

function testValidateRegressionConfig_invalidTimeout(): void {
  const config: CIRegressionConfig = {
    fixturePath: 'fixtures/',
    gitRef: 'main',
    environment: 'staging',
    timeoutSeconds: -1,
  };
  const result = validateRegressionConfig(config);
  assert(!result.isValid, 'negative timeout should be invalid');
  assert(result.errors.some(e => e.includes('timeoutSeconds')), 'should flag invalid timeout');
  console.log('✓ testValidateRegressionConfig_invalidTimeout passed');
}

// ── formatRegressionSummary ───────────────────────────────────────────────────

function testFormatRegressionSummary_allPassed(): void {
  const result: RegressionSuiteResult = {
    total: 10,
    passed: 10,
    failed: 0,
    failures: [],
    allPassed: true,
  };
  const summary = formatRegressionSummary(result);
  assert(summary.includes('✅'), 'summary should include success emoji');
  assert(summary.includes('10'), 'summary should include total count');
  assert(summary.includes('passed'), 'summary should mention passed');
  console.log('✓ testFormatRegressionSummary_allPassed passed');
}

function testFormatRegressionSummary_withFailures(): void {
  const result: RegressionSuiteResult = {
    total: 5,
    passed: 3,
    failed: 2,
    failures: [
      { seedId: 99, mode: 'invoker', expected: 'auth', actual: 'budget' },
      { seedId: 42, mode: 'contract', expected: 'state', error: 'invalid hex' },
    ],
    allPassed: false,
  };
  const summary = formatRegressionSummary(result);
  assert(summary.includes('❌'), 'summary should include failure emoji');
  assert(summary.includes('2 of 5'), 'summary should include failure ratio');
  assert(summary.includes('Seed 99'), 'summary should include first failure');
  assert(summary.includes('Seed 42'), 'summary should include second failure');
  console.log('✓ testFormatRegressionSummary_withFailures passed');
}

// ── shouldBlockDeployment ─────────────────────────────────────────────────────

function testShouldBlockDeployment_allPassed(): void {
  const result: RegressionSuiteResult = {
    total: 10,
    passed: 10,
    failed: 0,
    failures: [],
    allPassed: true,
  };
  assert(!shouldBlockDeployment(result), 'should not block when all passed');
  console.log('✓ testShouldBlockDeployment_allPassed passed');
}

function testShouldBlockDeployment_withFailures(): void {
  const result: RegressionSuiteResult = {
    total: 10,
    passed: 9,
    failed: 1,
    failures: [{ seedId: 99, mode: 'invoker', expected: 'auth', actual: 'budget' }],
    allPassed: false,
  };
  assert(shouldBlockDeployment(result), 'should block when any test fails');
  console.log('✓ testShouldBlockDeployment_withFailures passed');
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Automated Regression Deploy Integration Utils Tests...\n');
  try {
    // Original tests
    testIsBusyStage();
    testIsTerminalStage();
    testStageStepIndex();
    testDeriveTestsScheduled();
    testBuildBaselineDigest();
    testSummariseScenarios();
    testSummariseScenarios_empty();
    testValidateResult_valid();
    testValidateResult_passedExceedsScheduled();
    testValidateResult_missingDeploymentId();
    testValidateResult_negativeDuration();

    // CI Regression Integration tests (Issue #404)
    testParseRegressionOutput_allPassed();
    testParseRegressionOutput_withFailures();
    testParseRegressionOutput_withError();
    testParseRegressionOutput_emptyOutput();
    testValidateRegressionConfig_valid();
    testValidateRegressionConfig_missingFixturePath();
    testValidateRegressionConfig_missingGitRef();
    testValidateRegressionConfig_invalidTimeout();
    testFormatRegressionSummary_allPassed();
    testFormatRegressionSummary_withFailures();
    testShouldBlockDeployment_allPassed();
    testShouldBlockDeployment_withFailures();

    console.log('\n✅ All Automated Regression Deploy Integration utils tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
