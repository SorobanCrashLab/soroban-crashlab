import { fuzzySearch, getSearchableFieldLabels } from './fuzzy-search-utils';
import { FuzzingRun } from './types';

const mockRuns: FuzzingRun[] = [
  {
    id: 'run-001',
    status: 'completed',
    area: 'auth',
    severity: 'high',
    duration: 1500,
    seedCount: 5000,
    cpuInstructions: 750_000,
    memoryBytes: 4_500_000,
    minResourceFee: 1200,
    crashDetail: {
      failureCategory: 'InvariantViolation',
      signature: 'sig:token:transfer:assert_balance_nonnegative',
      signatureHash: 12345,
      payload: 'balance check failed',
      replayAction: 'replay --seed 0xabc',
    },
    tags: ['critical', 'production'],
    annotations: ['Needs investigation'],
    associatedIssues: [{ label: 'BUG-42', href: 'https://example.com/BUG-42' }],
  },
  {
    id: 'run-002',
    status: 'failed',
    area: 'budget',
    severity: 'critical',
    duration: 3200,
    seedCount: 12000,
    cpuInstructions: 1_200_000,
    memoryBytes: 8_000_000,
    minResourceFee: 3500,
    crashDetail: {
      failureCategory: 'BudgetExceeded',
      signature: 'sig:router:swap:budget_cpu_limit',
      payload: 'CPU budget exceeded',
      replayAction: 'replay --seed 0xdef',
    },
    tags: ['regression'],
    associatedIssues: [],
  },
  {
    id: 'run-003',
    status: 'running',
    area: 'state',
    severity: 'low',
    duration: 800,
    seedCount: 2000,
    cpuInstructions: 300_000,
    memoryBytes: 2_000_000,
    minResourceFee: 500,
    crashDetail: null,
    tags: [],
    annotations: [],
    associatedIssues: [],
  },
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function testFuzzySearchEmptyQuery() {
  const results = fuzzySearch(mockRuns, '');
  assert(results.length === 0, 'Empty query should return empty results');
  console.log('  ✓ Empty query returns no results');
}

function testFuzzySearchById() {
  const results = fuzzySearch(mockRuns, 'run-001');
  assert(results.length >= 1, 'Should find by run ID');
  assert(results[0].run.id === 'run-001', 'First result should be matching run');
  assert(results[0].score > 0, 'Should have a positive score');
  console.log('  ✓ Search by ID works');
}

function testFuzzySearchByStatus() {
  const results = fuzzySearch(mockRuns, 'failed');
  assert(results.length >= 1, 'Should find failed runs');
  const found = results.some((r) => r.run.status === 'failed');
  assert(found, 'At least one result should have status "failed"');
  console.log('  ✓ Search by status works');
}

function testFuzzySearchByArea() {
  const results = fuzzySearch(mockRuns, 'auth');
  assert(results.length >= 1, 'Should find auth area runs');
  console.log('  ✓ Search by area works');
}

function testFuzzySearchBySignature() {
  const results = fuzzySearch(mockRuns, 'balance');
  assert(results.length >= 1, 'Should find runs with balance in crash signature');
  console.log('  ✓ Search by crash signature works');
}

function testFuzzySearchRanking() {
  const results = fuzzySearch(mockRuns, 'critical');
  assert(results.length > 0, 'Should find results for "critical"');
  for (let i = 1; i < results.length; i++) {
    assert(results[i - 1].score >= results[i].score, 'Results should be sorted by score descending');
  }
  console.log('  ✓ Results are ranked by score');
}

function testFuzzySearchMatchedFields() {
  const results = fuzzySearch(mockRuns, 'run-001');
  if (results.length > 0) {
    assert(results[0].matchedFields.length > 0, 'Should report matched fields');
    const hasIdMatch = results[0].matchedFields.some((f) => f.field === 'Run ID');
    assert(hasIdMatch, 'Should show Run ID as matched field');
  }
  console.log('  ✓ Matched fields are reported');
}

function testFuzzySearchByTag() {
  const results = fuzzySearch(mockRuns, 'production');
  assert(results.length >= 1, 'Should find runs with "production" tag');
  console.log('  ✓ Search by tags works');
}

function testFuzzySearchAllRuns() {
  const results = fuzzySearch(mockRuns, 'run');
  assert(results.length >= 1, 'Should find runs matching "run"');
  console.log('  ✓ Broad search returns results');
}

function testGetSearchableFieldLabels() {
  const labels = getSearchableFieldLabels();
  assert(labels.length > 0, 'Should return field labels');
  assert(labels.includes('Run ID'), 'Should include Run ID');
  assert(labels.includes('Status'), 'Should include Status');
  console.log('  ✓ Searchable field labels are returned');
}

const tests = [
  testFuzzySearchEmptyQuery,
  testFuzzySearchById,
  testFuzzySearchByStatus,
  testFuzzySearchByArea,
  testFuzzySearchBySignature,
  testFuzzySearchRanking,
  testFuzzySearchMatchedFields,
  testFuzzySearchByTag,
  testFuzzySearchAllRuns,
  testGetSearchableFieldLabels,
];

let passed = 0;
let failed = 0;
for (const test of tests) {
  try {
    test();
    passed++;
  } catch (e) {
    console.error(`  ✗ ${test.name}: ${(e as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
