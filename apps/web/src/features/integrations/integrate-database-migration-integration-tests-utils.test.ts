import {
  computeSuiteScore,
  computeAggregateScore,
  isForwardMigration,
  isRollback,
  isIdempotentReimport,
  validateMigrationTestCase,
  formatMigrationPath,
  MigrationTestCase,
  MigrationSuite,
} from './integrate-database-migration-integration-tests-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeCase(overrides: Partial<MigrationTestCase> = {}): MigrationTestCase {
  return {
    id: 'tc-default',
    name: 'Default migration',
    fromVersion: 1,
    toVersion: 2,
    status: 'passed',
    durationMs: 50,
    affectedRecords: 100,
    ...overrides,
  };
}

function makeSuite(cases: MigrationTestCase[]): MigrationSuite {
  return { id: 'suite-test', label: 'Test Suite', description: 'desc', cases };
}

// ── computeSuiteScore ────────────────────────────────────────────────────────

function testComputeSuiteScore_primaryFlow(): void {
  const suite = makeSuite([
    makeCase({ id: 'a', status: 'passed' }),
    makeCase({ id: 'b', status: 'passed' }),
    makeCase({ id: 'c', status: 'failed', errorMessage: 'boom' }),
    makeCase({ id: 'd', status: 'pending' }),
  ]);
  const score = computeSuiteScore(suite);
  assert(score.total === 4, 'total should be 4');
  assert(score.passed === 2, 'passed should be 2');
  assert(score.failed === 1, 'failed should be 1');
  assert(score.pending === 1, 'pending should be 1');
  assert(score.running === 0, 'running should be 0');
  console.log('✓ testComputeSuiteScore_primaryFlow passed');
}

function testComputeSuiteScore_emptySuite(): void {
  const score = computeSuiteScore(makeSuite([]));
  assert(score.total === 0, 'empty suite total should be 0');
  assert(score.passed === 0, 'empty suite passed should be 0');
  console.log('✓ testComputeSuiteScore_emptySuite passed');
}

// ── computeAggregateScore ────────────────────────────────────────────────────

function testComputeAggregateScore(): void {
  const suites: MigrationSuite[] = [
    makeSuite([makeCase({ id: 'a', status: 'passed' }), makeCase({ id: 'b', status: 'failed', errorMessage: 'e' })]),
    makeSuite([makeCase({ id: 'c', status: 'running' }), makeCase({ id: 'd', status: 'skipped' })]),
  ];
  const agg = computeAggregateScore(suites);
  assert(agg.total === 4, 'aggregate total should be 4');
  assert(agg.passed === 1, 'aggregate passed should be 1');
  assert(agg.failed === 1, 'aggregate failed should be 1');
  assert(agg.running === 1, 'aggregate running should be 1');
  assert(agg.skipped === 1, 'aggregate skipped should be 1');
  console.log('✓ testComputeAggregateScore passed');
}

function testComputeAggregateScore_noSuites(): void {
  const agg = computeAggregateScore([]);
  assert(agg.total === 0, 'no suites should produce total 0');
  console.log('✓ testComputeAggregateScore_noSuites passed');
}

// ── Migration path helpers ───────────────────────────────────────────────────

function testMigrationPathHelpers(): void {
  const forward = makeCase({ fromVersion: 1, toVersion: 2 });
  assert(isForwardMigration(forward), 'v1→v2 should be forward');
  assert(!isRollback(forward), 'v1→v2 should not be rollback');
  assert(!isIdempotentReimport(forward), 'v1→v2 should not be idempotent');

  const rollback = makeCase({ fromVersion: 2, toVersion: 1 });
  assert(!isForwardMigration(rollback), 'v2→v1 should not be forward');
  assert(isRollback(rollback), 'v2→v1 should be rollback');
  assert(!isIdempotentReimport(rollback), 'v2→v1 should not be idempotent');

  const noop = makeCase({ fromVersion: 1, toVersion: 1 });
  assert(!isForwardMigration(noop), 'v1→v1 should not be forward');
  assert(!isRollback(noop), 'v1→v1 should not be rollback');
  assert(isIdempotentReimport(noop), 'v1→v1 should be idempotent');

  console.log('✓ testMigrationPathHelpers passed');
}

// ── validateMigrationTestCase ────────────────────────────────────────────────

function testValidateMigrationTestCase_valid(): void {
  const result = validateMigrationTestCase(makeCase());
  assert(result.isValid, 'valid case should pass');
  assert(result.errors.length === 0, 'valid case should have no errors');
  console.log('✓ testValidateMigrationTestCase_valid passed');
}

function testValidateMigrationTestCase_failedWithoutError(): void {
  const result = validateMigrationTestCase(makeCase({ status: 'failed', errorMessage: undefined }));
  assert(!result.isValid, 'failed case without errorMessage should be invalid');
  assert(
    result.errors.includes('errorMessage is required when status is failed'),
    'should flag missing errorMessage'
  );
  console.log('✓ testValidateMigrationTestCase_failedWithoutError passed');
}

function testValidateMigrationTestCase_negativeVersions(): void {
  const result = validateMigrationTestCase(makeCase({ fromVersion: -1, toVersion: -2 }));
  assert(!result.isValid, 'negative versions should be invalid');
  assert(result.errors.some(e => e.includes('fromVersion')), 'should flag fromVersion');
  assert(result.errors.some(e => e.includes('toVersion')), 'should flag toVersion');
  console.log('✓ testValidateMigrationTestCase_negativeVersions passed');
}

function testValidateMigrationTestCase_negativeDuration(): void {
  const result = validateMigrationTestCase(makeCase({ durationMs: -5 }));
  assert(!result.isValid, 'negative durationMs should be invalid');
  assert(result.errors.some(e => e.includes('durationMs')), 'should flag durationMs');
  console.log('✓ testValidateMigrationTestCase_negativeDuration passed');
}

function testValidateMigrationTestCase_missingId(): void {
  const result = validateMigrationTestCase(makeCase({ id: '' }));
  assert(!result.isValid, 'empty id should be invalid');
  console.log('✓ testValidateMigrationTestCase_missingId passed');
}

// ── formatMigrationPath ──────────────────────────────────────────────────────

function testFormatMigrationPath(): void {
  assert(formatMigrationPath(0, 1) === 'v0 → v1', 'v0→v1 format');
  assert(formatMigrationPath(1, 1) === 'v1 → v1', 'v1→v1 format');
  assert(formatMigrationPath(3, 0) === 'v3 → v0', 'rollback format');
  console.log('✓ testFormatMigrationPath passed');
}

// ── Runner ───────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Database Migration Integration Tests Utils Tests...\n');
  try {
    testComputeSuiteScore_primaryFlow();
    testComputeSuiteScore_emptySuite();
    testComputeAggregateScore();
    testComputeAggregateScore_noSuites();
    testMigrationPathHelpers();
    testValidateMigrationTestCase_valid();
    testValidateMigrationTestCase_failedWithoutError();
    testValidateMigrationTestCase_negativeVersions();
    testValidateMigrationTestCase_negativeDuration();
    testValidateMigrationTestCase_missingId();
    testFormatMigrationPath();
    console.log('\n✅ All Database Migration Integration Tests utils tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
