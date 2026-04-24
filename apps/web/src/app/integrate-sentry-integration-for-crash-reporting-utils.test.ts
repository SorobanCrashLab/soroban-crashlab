import {
  validateSentryConfig,
  isDsnReachable,
  validateCrashReport,
  summariseReports,
  formatTimestamp,
  buildSentryEventUrl,
  SentryConfig,
  CrashReport,
} from './integrate-sentry-integration-for-crash-reporting-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SentryConfig> = {}): SentryConfig {
  return {
    dsn: 'https://abc123@o123456.ingest.sentry.io/789',
    environment: 'production',
    enabled: true,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    ...overrides,
  };
}

function makeReport(overrides: Partial<CrashReport> = {}): CrashReport {
  return {
    id: 'crash-001',
    timestamp: '2026-04-24T10:00:00Z',
    signature: 'sig:1001:contract::transfer:assert_balance_nonnegative',
    sentryEventId: '7f3a9b2c1d4e5f6a',
    status: 'sent',
    ...overrides,
  };
}

// ── validateSentryConfig ──────────────────────────────────────────────────────

function testValidateSentryConfig_valid(): void {
  const r = validateSentryConfig(makeConfig());
  assert(r.isValid, 'valid config should pass');
  assert(r.errors.length === 0, 'valid config should have no errors');
  console.log('✓ testValidateSentryConfig_valid passed');
}

function testValidateSentryConfig_missingDsn(): void {
  const r = validateSentryConfig(makeConfig({ dsn: '' }));
  assert(!r.isValid, 'empty DSN should be invalid');
  assert(r.errors.includes('DSN is required'), 'should flag missing DSN');
  console.log('✓ testValidateSentryConfig_missingDsn passed');
}

function testValidateSentryConfig_invalidDsn(): void {
  const r = validateSentryConfig(makeConfig({ dsn: 'http://not-a-real-dsn.com' }));
  assert(!r.isValid, 'non-sentry DSN should be invalid');
  assert(r.errors.some(e => e.includes('valid Sentry DSN')), 'should flag invalid DSN format');
  console.log('✓ testValidateSentryConfig_invalidDsn passed');
}

function testValidateSentryConfig_sampleRateOutOfRange(): void {
  const r1 = validateSentryConfig(makeConfig({ sampleRate: -0.1 }));
  assert(!r1.isValid, 'negative sampleRate should be invalid');

  const r2 = validateSentryConfig(makeConfig({ sampleRate: 1.1 }));
  assert(!r2.isValid, 'sampleRate > 1 should be invalid');

  const r3 = validateSentryConfig(makeConfig({ sampleRate: 0.5 }));
  assert(r3.isValid, 'sampleRate 0.5 should be valid');
  console.log('✓ testValidateSentryConfig_sampleRateOutOfRange passed');
}

function testValidateSentryConfig_missingEnvironment(): void {
  const r = validateSentryConfig(makeConfig({ environment: '' }));
  assert(!r.isValid, 'empty environment should be invalid');
  assert(r.errors.includes('environment is required'), 'should flag missing environment');
  console.log('✓ testValidateSentryConfig_missingEnvironment passed');
}

// ── isDsnReachable ────────────────────────────────────────────────────────────

function testIsDsnReachable(): void {
  assert(isDsnReachable('https://key@org.ingest.sentry.io/123'), 'ingest URL should be reachable');
  assert(isDsnReachable('https://key@o123.sentry.io/456'), 'sentry.io URL should be reachable');
  assert(!isDsnReachable(''), 'empty string should not be reachable');
  assert(!isDsnReachable('http://localhost:9000'), 'localhost should not be reachable');
  console.log('✓ testIsDsnReachable passed');
}

// ── validateCrashReport ───────────────────────────────────────────────────────

function testValidateCrashReport_valid(): void {
  const r = validateCrashReport(makeReport());
  assert(r.isValid, 'valid report should pass');
  console.log('✓ testValidateCrashReport_valid passed');
}

function testValidateCrashReport_missingId(): void {
  const r = validateCrashReport(makeReport({ id: '' }));
  assert(!r.isValid, 'empty id should be invalid');
  assert(r.errors.includes('id is required'), 'should flag missing id');
  console.log('✓ testValidateCrashReport_missingId passed');
}

function testValidateCrashReport_invalidTimestamp(): void {
  const r = validateCrashReport(makeReport({ timestamp: 'not-a-date' }));
  assert(!r.isValid, 'invalid timestamp should fail');
  assert(r.errors.some(e => e.includes('valid ISO date')), 'should flag invalid timestamp');
  console.log('✓ testValidateCrashReport_invalidTimestamp passed');
}

function testValidateCrashReport_invalidStatus(): void {
  const r = validateCrashReport(makeReport({ status: 'unknown' as never }));
  assert(!r.isValid, 'invalid status should fail');
  assert(r.errors.some(e => e.includes('status must be one of')), 'should flag invalid status');
  console.log('✓ testValidateCrashReport_invalidStatus passed');
}

// ── summariseReports ──────────────────────────────────────────────────────────

function testSummariseReports_primaryFlow(): void {
  const reports: CrashReport[] = [
    makeReport({ id: 'a', status: 'sent' }),
    makeReport({ id: 'b', status: 'sent' }),
    makeReport({ id: 'c', status: 'pending' }),
    makeReport({ id: 'd', status: 'failed' }),
  ];
  const s = summariseReports(reports);
  assert(s.total === 4, 'total should be 4');
  assert(s.sent === 2, 'sent should be 2');
  assert(s.pending === 1, 'pending should be 1');
  assert(s.failed === 1, 'failed should be 1');
  console.log('✓ testSummariseReports_primaryFlow passed');
}

function testSummariseReports_empty(): void {
  const s = summariseReports([]);
  assert(s.total === 0, 'empty total should be 0');
  console.log('✓ testSummariseReports_empty passed');
}

// ── formatTimestamp ───────────────────────────────────────────────────────────

function testFormatTimestamp(): void {
  const valid = '2026-04-24T10:00:00Z';
  const formatted = formatTimestamp(valid);
  assert(formatted !== valid, 'valid ISO should be reformatted');
  assert(formatted.length > 0, 'result should be non-empty');

  const invalid = 'not-a-date';
  assert(formatTimestamp(invalid) === invalid, 'invalid date should return original string');
  console.log('✓ testFormatTimestamp passed');
}

// ── buildSentryEventUrl ───────────────────────────────────────────────────────

function testBuildSentryEventUrl(): void {
  const url = buildSentryEventUrl('7f3a9b2c1d4e5f6a');
  assert(url === 'https://sentry.io/events/7f3a9b2c1d4e5f6a/', 'should build correct Sentry URL');
  assert(url.startsWith('https://sentry.io/events/'), 'should use sentry.io base');
  assert(url.endsWith('/'), 'should end with trailing slash');
  console.log('✓ testBuildSentryEventUrl passed');
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Sentry Integration for Crash Reporting Utils Tests...\n');
  try {
    testValidateSentryConfig_valid();
    testValidateSentryConfig_missingDsn();
    testValidateSentryConfig_invalidDsn();
    testValidateSentryConfig_sampleRateOutOfRange();
    testValidateSentryConfig_missingEnvironment();
    testIsDsnReachable();
    testValidateCrashReport_valid();
    testValidateCrashReport_missingId();
    testValidateCrashReport_invalidTimestamp();
    testValidateCrashReport_invalidStatus();
    testSummariseReports_primaryFlow();
    testSummariseReports_empty();
    testFormatTimestamp();
    testBuildSentryEventUrl();
    console.log('\n✅ All Sentry Integration for Crash Reporting utils tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
