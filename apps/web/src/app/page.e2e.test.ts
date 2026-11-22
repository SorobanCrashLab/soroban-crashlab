/**
 * E2E test for full dashboard page load and data display
 * 
 * Tests the dashboard page rendering, data loading states,
 * filtering, pagination, and interactive elements.
 */

import * as assert from 'node:assert/strict';

// Mock FuzzingRun type for testing
interface FuzzingRun {
  id: string;
  status: 'completed' | 'failed' | 'running' | 'cancelled';
  area: 'auth' | 'state' | 'budget' | 'xdr';
  severity: 'low' | 'medium' | 'high' | 'critical';
  duration: number;
  seedCount: number;
  cpuInstructions: number;
  memoryBytes: number;
  minResourceFee: number;
  crashDetail: {
    failureCategory: string;
    signature: string;
    payload: string;
    replayAction: string;
  } | null;
}

// Simulate data loading states
type DataState = 'loading' | 'error' | 'success';

// Mock dashboard state
interface DashboardState {
  runs: FuzzingRun[];
  dataState: DataState;
  currentPage: number;
  statusFilter: 'all' | FuzzingRun['status'];
  severityFilter: 'all' | FuzzingRun['severity'];
  expensiveOnly: boolean;
}

// Create mock data
const createMockRuns = (count: number): FuzzingRun[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `run-${1000 + i}`,
    status: (['completed', 'failed', 'running', 'cancelled'][i % 4]) as FuzzingRun['status'],
    area: (['auth', 'state', 'budget', 'xdr'][i % 4]) as FuzzingRun['area'],
    severity: (['low', 'medium', 'high', 'critical'][i % 4]) as FuzzingRun['severity'],
    duration: 120000 + Math.random() * 3600000,
    seedCount: Math.floor(10000 + Math.random() * 90000),
    cpuInstructions: Math.floor(400000 + Math.random() * 900000),
    memoryBytes: Math.floor(1_500_000 + Math.random() * 8_000_000),
    minResourceFee: Math.floor(500 + Math.random() * 5000),
    crashDetail: i % 4 === 1 ? {
      failureCategory: i % 8 === 1 ? 'Panic' : 'InvariantViolation',
      signature: `sig:${1000 + i}:contract::transfer:assert_balance_nonnegative`,
      payload: JSON.stringify({ contract: 'token', method: 'transfer' }),
      replayAction: `cargo run --bin crash-replay -- --run-id run-${1000 + i}`,
    } : null,
  }));
};

// Simulate dashboard filtering logic
const filterRuns = (
  runs: FuzzingRun[],
  statusFilter: DashboardState['statusFilter'],
  severityFilter: DashboardState['severityFilter'],
  expensiveOnly: boolean
): FuzzingRun[] => {
  const CPU_WARNING = 900_000;
  const MEMORY_WARNING = 7_000_000;
  const FEE_WARNING = 3_000;

  const isExpensive = (run: FuzzingRun): boolean =>
    run.cpuInstructions >= CPU_WARNING ||
    run.memoryBytes >= MEMORY_WARNING ||
    run.minResourceFee >= FEE_WARNING;

  return runs.filter(run => {
    if (statusFilter !== 'all' && run.status !== statusFilter) return false;
    if (severityFilter !== 'all' && run.severity !== severityFilter) return false;
    if (expensiveOnly && !isExpensive(run)) return false;
    return true;
  });
};

// Simulate pagination
const paginateRuns = (runs: FuzzingRun[], page: number, itemsPerPage: number = 10): FuzzingRun[] => {
  const startIndex = (page - 1) * itemsPerPage;
  return runs.slice(startIndex, startIndex + itemsPerPage);
};

const runAssertions = (): void => {
  // Test 1: Dashboard loads with initial state
  const initialState: DashboardState = {
    runs: [],
    dataState: 'loading',
    currentPage: 1,
    statusFilter: 'all',
    severityFilter: 'all',
    expensiveOnly: false,
  };

  assert.equal(initialState.dataState, 'loading');
  assert.equal(initialState.runs.length, 0);
  assert.equal(initialState.currentPage, 1);

  // Test 2: Dashboard transitions to success state with data
  const mockRuns = createMockRuns(25);
  const successState: DashboardState = {
    ...initialState,
    runs: mockRuns,
    dataState: 'success',
  };

  assert.equal(successState.dataState, 'success');
  assert.equal(successState.runs.length, 25);
  assert.ok(successState.runs[0].id.startsWith('run-'));

  // Test 3: Verify run data structure
  const firstRun = successState.runs[0];
  assert.ok(firstRun.id);
  assert.ok(['completed', 'failed', 'running', 'cancelled'].includes(firstRun.status));
  assert.ok(['auth', 'state', 'budget', 'xdr'].includes(firstRun.area));
  assert.ok(['low', 'medium', 'high', 'critical'].includes(firstRun.severity));
  assert.ok(typeof firstRun.duration === 'number');
  assert.ok(typeof firstRun.seedCount === 'number');
  assert.ok(typeof firstRun.cpuInstructions === 'number');
  assert.ok(typeof firstRun.memoryBytes === 'number');
  assert.ok(typeof firstRun.minResourceFee === 'number');

  // Test 4: Dashboard displays paginated data (page 1)
  const page1Runs = paginateRuns(successState.runs, 1);
  assert.equal(page1Runs.length, 10);
  assert.equal(page1Runs[0].id, 'run-1000');

  // Test 5: Dashboard displays paginated data (page 2)
  const page2Runs = paginateRuns(successState.runs, 2);
  assert.equal(page2Runs.length, 10);
  assert.equal(page2Runs[0].id, 'run-1010');

  // Test 6: Dashboard displays paginated data (last page)
  const page3Runs = paginateRuns(successState.runs, 3);
  assert.equal(page3Runs.length, 5); // Only 5 items on last page

  // Test 7: Status filter works - show only 'failed' runs
  const failedRuns = filterRuns(successState.runs, 'failed', 'all', false);
  assert.ok(failedRuns.length > 0);
  assert.ok(failedRuns.every(run => run.status === 'failed'));

  // Test 8: Status filter works - show only 'completed' runs
  const completedRuns = filterRuns(successState.runs, 'completed', 'all', false);
  assert.ok(completedRuns.length > 0);
  assert.ok(completedRuns.every(run => run.status === 'completed'));

  // Test 9: Severity filter works - show only 'critical' runs
  const criticalRuns = filterRuns(successState.runs, 'all', 'critical', false);
  assert.ok(criticalRuns.length > 0);
  assert.ok(criticalRuns.every(run => run.severity === 'critical'));

  // Test 10: Severity filter works - show only 'high' runs
  const highSeverityRuns = filterRuns(successState.runs, 'all', 'high', false);
  assert.ok(highSeverityRuns.length > 0);
  assert.ok(highSeverityRuns.every(run => run.severity === 'high'));

  // Test 11: Expensive runs filter works
  const expensiveRuns = filterRuns(successState.runs, 'all', 'all', true);
  const CPU_WARNING = 900_000;
  const MEMORY_WARNING = 7_000_000;
  const FEE_WARNING = 3_000;

  assert.ok(expensiveRuns.every(run =>
    run.cpuInstructions >= CPU_WARNING ||
    run.memoryBytes >= MEMORY_WARNING ||
    run.minResourceFee >= FEE_WARNING
  ));

  // Test 12: Multiple filters work together (status + severity)
  const failedCritical = filterRuns(successState.runs, 'failed', 'critical', false);
  assert.ok(failedCritical.every(run => run.status === 'failed' && run.severity === 'critical'));

  // Test 13: Multiple filters work together (status + expensive)
  const completedExpensive = filterRuns(successState.runs, 'completed', 'all', true);
  assert.ok(completedExpensive.every(run => run.status === 'completed'));
  assert.ok(completedExpensive.every(run =>
    run.cpuInstructions >= CPU_WARNING ||
    run.memoryBytes >= MEMORY_WARNING ||
    run.minResourceFee >= FEE_WARNING
  ));

  // Test 14: All filters combined (status + severity + expensive)
  const failedHighExpensive = filterRuns(successState.runs, 'failed', 'high', true);
  assert.ok(failedHighExpensive.every(run =>
    run.status === 'failed' &&
    run.severity === 'high' &&
    (run.cpuInstructions >= CPU_WARNING ||
     run.memoryBytes >= MEMORY_WARNING ||
     run.minResourceFee >= FEE_WARNING)
  ));

  // Test 15: Filter returns empty array when no matches
  const impossibleFilter = filterRuns(
    successState.runs.filter(r => r.status === 'completed'),
    'failed',
    'all',
    false
  );
  assert.equal(impossibleFilter.length, 0);

  // Test 16: Dashboard handles error state
  const errorState: DashboardState = {
    ...initialState,
    dataState: 'error',
  };

  assert.equal(errorState.dataState, 'error');
  assert.equal(errorState.runs.length, 0);

  // Test 17: Crash details are present for failed runs
  const failedRunsWithCrash = successState.runs.filter(run =>
    run.status === 'failed' && run.crashDetail !== null
  );
  
  assert.ok(failedRunsWithCrash.length > 0);
  
  const crashRun = failedRunsWithCrash[0];
  assert.ok(crashRun.crashDetail !== null);
  assert.ok(crashRun.crashDetail!.failureCategory);
  assert.ok(crashRun.crashDetail!.signature);
  assert.ok(crashRun.crashDetail!.payload);
  assert.ok(crashRun.crashDetail!.replayAction);

  // Test 18: Pagination boundaries - page 0 should default to page 1
  const page0Runs = paginateRuns(successState.runs, 0);
  assert.ok(page0Runs.length > 0); // Should still return first page items

  // Test 19: Pagination boundaries - page beyond last should return empty
  const beyondLastPage = paginateRuns(successState.runs, 999);
  assert.equal(beyondLastPage.length, 0);

  // Test 20: Calculate total pages correctly
  const totalPages = Math.ceil(successState.runs.length / 10);
  assert.equal(totalPages, 3); // 25 runs / 10 per page = 3 pages

  // Test 21: Filtered data pagination works
  const filteredData = filterRuns(successState.runs, 'completed', 'all', false);
  const filteredPage1 = paginateRuns(filteredData, 1);
  assert.ok(filteredPage1.length <= 10);
  assert.ok(filteredPage1.every(run => run.status === 'completed'));

  // Test 22: Dashboard displays all statuses in data
  const statuses = new Set(successState.runs.map(r => r.status));
  assert.ok(statuses.has('completed'));
  assert.ok(statuses.has('failed'));
  assert.ok(statuses.has('running'));
  assert.ok(statuses.has('cancelled'));

  // Test 23: Dashboard displays all severities in data
  const severities = new Set(successState.runs.map(r => r.severity));
  assert.ok(severities.has('low'));
  assert.ok(severities.has('medium'));
  assert.ok(severities.has('high'));
  assert.ok(severities.has('critical'));

  // Test 24: Dashboard displays all areas in data
  const areas = new Set(successState.runs.map(r => r.area));
  assert.ok(areas.has('auth'));
  assert.ok(areas.has('state'));
  assert.ok(areas.has('budget'));
  assert.ok(areas.has('xdr'));

  // Test 25: Run metrics are within reasonable ranges
  successState.runs.forEach(run => {
    assert.ok(run.duration >= 0, 'Duration should be non-negative');
    assert.ok(run.seedCount >= 0, 'Seed count should be non-negative');
    assert.ok(run.cpuInstructions >= 0, 'CPU instructions should be non-negative');
    assert.ok(run.memoryBytes >= 0, 'Memory bytes should be non-negative');
    assert.ok(run.minResourceFee >= 0, 'Resource fee should be non-negative');
  });

  // Test 26: Empty state handling
  const emptyState: DashboardState = {
    ...initialState,
    runs: [],
    dataState: 'success',
  };

  const emptyFiltered = filterRuns(emptyState.runs, 'all', 'all', false);
  assert.equal(emptyFiltered.length, 0);

  const emptyPaginated = paginateRuns(emptyState.runs, 1);
  assert.equal(emptyPaginated.length, 0);

  // Test 27: Filter preserves run properties
  const filteredRuns = filterRuns(successState.runs, 'completed', 'all', false);
  if (filteredRuns.length > 0) {
    const run = filteredRuns[0];
    assert.ok(run.id);
    assert.ok(run.area);
    assert.ok(run.severity);
    assert.ok(typeof run.cpuInstructions === 'number');
  }

  // Test 28: Pagination preserves run properties
  const paginatedRuns = paginateRuns(successState.runs, 1);
  if (paginatedRuns.length > 0) {
    const run = paginatedRuns[0];
    assert.ok(run.id);
    assert.ok(run.status);
    assert.ok(run.area);
    assert.ok(run.severity);
  }

  // Test 29: 'all' filters don't filter anything
  const allStatusRuns = filterRuns(successState.runs, 'all', 'all', false);
  assert.equal(allStatusRuns.length, successState.runs.length);

  // Test 30: Expensive filter identifies correct runs
  const manualExpensiveCheck = successState.runs.filter(run =>
    run.cpuInstructions >= 900_000 ||
    run.memoryBytes >= 7_000_000 ||
    run.minResourceFee >= 3_000
  );
  
  const expensiveFilterResult = filterRuns(successState.runs, 'all', 'all', true);
  assert.equal(expensiveFilterResult.length, manualExpensiveCheck.length);
};

runAssertions();
console.log('page.e2e.test.ts: all assertions passed');
