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

// ── Runner ────────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Automated Regression Deploy Integration Utils Tests...\n');
  try {
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
    console.log('\n✅ All Automated Regression Deploy Integration utils tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
