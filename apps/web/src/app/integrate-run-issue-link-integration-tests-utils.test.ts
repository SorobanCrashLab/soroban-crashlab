import {
  validateTracker,
  buildIssueLink,
  summariseTests,
  toggleTrackerEnabled,
  runIssueLinkIntegrationFlow,
  IssueTracker,
  IntegrationTest,
  RunIssueLinkDependencies,
} from './integrate-run-issue-link-integration-tests-utils';
import type { RunIssueLink } from './types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function makeTracker(overrides: Partial<IssueTracker> = {}): IssueTracker {
  return {
    id: 'gh-1',
    name: 'GitHub',
    type: 'github',
    baseUrl: 'https://github.com/test/repo/issues',
    enabled: true,
    ...overrides
  };
}

function testValidateTracker_valid(): void {
  const r = validateTracker(makeTracker());
  assert(r.isValid, 'valid tracker should pass');
  assert(r.errors.length === 0, 'valid tracker should have no errors');
  console.log('✓ testValidateTracker_valid passed');
}

function testValidateTracker_missingId(): void {
  const r = validateTracker(makeTracker({ id: '' }));
  assert(!r.isValid, 'empty id should fail');
  console.log('✓ testValidateTracker_missingId passed');
}

function testValidateTracker_invalidType(): void {
  const r = validateTracker(makeTracker({ type: 'gitlab' as never }));
  assert(!r.isValid, 'invalid type should fail');
  console.log('✓ testValidateTracker_invalidType passed');
}

function testValidateTracker_invalidBaseUrl(): void {
  const r = validateTracker(makeTracker({ baseUrl: 'ftp://github.com/issues' }));
  assert(!r.isValid, 'invalid base URL should fail');
  console.log('✓ testValidateTracker_invalidBaseUrl passed');
}

function testBuildIssueLink(): void {
  const tracker = makeTracker({ type: 'jira', baseUrl: 'https://jira.example.com/browse' });
  const link = buildIssueLink(tracker, 'PROJ-123');
  assert(link.label === 'JIRA-PROJ-123', 'label should match type-issuenumber');
  assert(link.href === 'https://jira.example.com/browse/PROJ-123', 'href should be correctly formed');
  console.log('✓ testBuildIssueLink passed');
}

function testSummariseTests(): void {
  const tests: IntegrationTest[] = [
    { id: '1', name: 'A', status: 'passed' },
    { id: '2', name: 'B', status: 'failed' },
    { id: '3', name: 'C', status: 'pending' },
    { id: '4', name: 'D', status: 'running' },
    { id: '5', name: 'E', status: 'passed' }
  ];
  const s = summariseTests(tests);
  assert(s.total === 5, 'total should be 5');
  assert(s.passed === 2, 'passed should be 2');
  assert(s.failed === 1, 'failed should be 1');
  assert(s.pending === 1, 'pending should be 1');
  assert(s.running === 1, 'running should be 1');
  console.log('✓ testSummariseTests passed');
}

function testToggleTrackerEnabled(): void {
  const trackers = [
    makeTracker({ id: '1', enabled: true }),
    makeTracker({ id: '2', enabled: false })
  ];
  
  const toggled = toggleTrackerEnabled(trackers, '1');
  assert(!toggled[0].enabled, 'tracker 1 should be disabled');
  assert(!toggled[1].enabled, 'tracker 2 should remain disabled');
  assert(trackers[0].enabled, 'original array should not be mutated');
  console.log('✓ testToggleTrackerEnabled passed');
}

function makeDeps(overrides: Partial<RunIssueLinkDependencies> = {}): RunIssueLinkDependencies {
  const runIssues: RunIssueLink[] = [];
  return {
    async getRunById(runId: string) {
      return runId === 'run-1001' ? { id: runId, issues: runIssues } : null;
    },
    async getEnabledTrackerById(trackerId: string) {
      if (trackerId !== 'gh-1') return null;
      return makeTracker();
    },
    async createRunIssueLink(args) {
      const link = buildIssueLink(args.tracker, args.issueNumber);
      runIssues.push(link);
      return link;
    },
    async verifyIssueLink() {
      return { reachable: true, statusCode: 200 };
    },
    ...overrides,
  };
}

async function testRunIssueLinkIntegrationFlow_successPath(): Promise<void> {
  const result = await runIssueLinkIntegrationFlow(
    { runId: 'run-1001', trackerId: 'gh-1', issueNumber: '411' },
    makeDeps(),
  );

  assert(result.success, 'integration flow should succeed');
  assert(result.link?.href === 'https://github.com/test/repo/issues/411', 'created href should match tracker URL');
  assert(result.tests.length === 5, 'all deterministic steps should be reported');
  assert(result.tests.every((step) => step.status === 'passed'), 'all steps should pass');
  console.log('✓ testRunIssueLinkIntegrationFlow_successPath passed');
}

async function testRunIssueLinkIntegrationFlow_trackerUnavailable(): Promise<void> {
  const result = await runIssueLinkIntegrationFlow(
    { runId: 'run-1001', trackerId: 'missing', issueNumber: '411' },
    makeDeps(),
  );

  assert(!result.success, 'flow should fail when tracker cannot be resolved');
  assert(result.tests.some((step) => step.id === 'tracker-lookup' && step.status === 'failed'), 'tracker lookup should fail');
  console.log('✓ testRunIssueLinkIntegrationFlow_trackerUnavailable passed');
}

async function testRunIssueLinkIntegrationFlow_edge_duplicateLink(): Promise<void> {
  const existing = buildIssueLink(makeTracker(), '411');
  const result = await runIssueLinkIntegrationFlow(
    { runId: 'run-1001', trackerId: 'gh-1', issueNumber: '411' },
    makeDeps({
      async getRunById(runId: string) {
        return runId === 'run-1001' ? { id: runId, issues: [existing] } : null;
      },
    }),
  );

  assert(!result.success, 'flow should fail on duplicate run->issue link');
  assert(result.tests.some((step) => step.id === 'dedupe-check' && step.status === 'failed'), 'duplicate check should fail');
  console.log('✓ testRunIssueLinkIntegrationFlow_edge_duplicateLink passed');
}

async function testRunIssueLinkIntegrationFlow_downstreamVerificationFailure(): Promise<void> {
  const result = await runIssueLinkIntegrationFlow(
    { runId: 'run-1001', trackerId: 'gh-1', issueNumber: '411' },
    makeDeps({
      async verifyIssueLink() {
        return { reachable: false, statusCode: 503 };
      },
    }),
  );

  assert(!result.success, 'flow should fail when downstream endpoint is unreachable');
  assert(result.tests.some((step) => step.id === 'link-verify' && step.status === 'failed'), 'verification step should fail');
  console.log('✓ testRunIssueLinkIntegrationFlow_downstreamVerificationFailure passed');
}

async function runAllTests(): Promise<void> {
  console.log('Running Run Issue Link Integration Tests Utils Tests...\\n');
  try {
    testValidateTracker_valid();
    testValidateTracker_missingId();
    testValidateTracker_invalidType();
    testValidateTracker_invalidBaseUrl();
    testBuildIssueLink();
    testSummariseTests();
    testToggleTrackerEnabled();
    await testRunIssueLinkIntegrationFlow_successPath();
    await testRunIssueLinkIntegrationFlow_trackerUnavailable();
    await testRunIssueLinkIntegrationFlow_edge_duplicateLink();
    await testRunIssueLinkIntegrationFlow_downstreamVerificationFailure();
    console.log('\\n✅ All Run Issue Link Integration Tests utils tests passed!');
  } catch (error) {
    console.error('\\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void runAllTests();
}
