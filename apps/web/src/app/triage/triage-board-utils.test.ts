import * as assert from 'node:assert/strict';
import {
  TRIAGE_COLUMNS,
  getColumnRuns,
  getColumnCounts,
  getRunsWithIssues,
  getIssueCounts,
} from './triage-board-utils';
import type { FuzzingRun } from '../types';
import type { RunIssueLink } from '../types';

const issueA: RunIssueLink = { label: '#10 Auth bug', href: 'https://github.com/test/10' };
const issueB: RunIssueLink = { label: '#20 XDR crash', href: 'https://github.com/test/20' };
const issueC: RunIssueLink = { label: '#30 Follow-up', href: 'https://github.com/test/30' };

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'r0',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1000,
    seedCount: 100,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    crashDetail: null,
    ...overrides,
  };
}

const base: FuzzingRun[] = [
  makeRun({ id: 'r1', status: 'failed',    area: 'auth',   severity: 'high' }),
  makeRun({ id: 'r2', status: 'running',   area: 'state',  severity: 'low' }),
  makeRun({ id: 'r3', status: 'cancelled', area: 'budget', severity: 'medium' }),
  makeRun({ id: 'r4', status: 'failed',    area: 'xdr',    severity: 'critical' }),
  makeRun({ id: 'r5', status: 'completed', area: 'auth',   severity: 'low' }),
];

// ---------------------------------------------------------------------------
// getColumnRuns
// ---------------------------------------------------------------------------

function testColumnRunsFailed(): void {
  assert.deepEqual(
    getColumnRuns(base, TRIAGE_COLUMNS[0]).map((r) => r.id),
    ['r1', 'r4'],
  );
}

function testColumnRunsActive(): void {
  assert.deepEqual(
    getColumnRuns(base, TRIAGE_COLUMNS[1]).map((r) => r.id),
    ['r2'],
  );
}

function testColumnRunsCancelled(): void {
  assert.deepEqual(
    getColumnRuns(base, TRIAGE_COLUMNS[2]).map((r) => r.id),
    ['r3'],
  );
}

function testColumnRunsEmptyArray(): void {
  assert.deepEqual(getColumnRuns([], TRIAGE_COLUMNS[0]), []);
}

function testColumnRunsNoMatches(): void {
  const completedRuns: FuzzingRun[] = [makeRun({ id: 'r5', status: 'completed' })];
  assert.deepEqual(getColumnRuns(completedRuns, TRIAGE_COLUMNS[0]), []);
}

// ---------------------------------------------------------------------------
// getColumnCounts
// ---------------------------------------------------------------------------

function testColumnCountsNormal(): void {
  assert.deepEqual(getColumnCounts(base), { failed: 2, active: 1, cancelled: 1 });
}

function testColumnCountsEmpty(): void {
  assert.deepEqual(getColumnCounts([]), { failed: 0, active: 0, cancelled: 0 });
}

function testColumnCountsUnknownStatus(): void {
  const runs: FuzzingRun[] = [
    makeRun({ id: 'r1', status: 'failed' }),
    makeRun({ id: 'r2', status: 'completed' }),
  ];
  const counts = getColumnCounts(runs);
  assert.equal(counts.failed, 1);
  assert.equal(counts.active, 0);
  assert.equal(counts.cancelled, 0);
}

// ---------------------------------------------------------------------------
// getRunsWithIssues
// ---------------------------------------------------------------------------

function testGetRunsWithIssuesMergesFromMap(): void {
  const issueMap = new Map<string, RunIssueLink[]>();
  issueMap.set('r1', [issueA, issueC]);
  issueMap.set('r4', [issueB]);

  const enriched = getRunsWithIssues(base, issueMap);
  assert.equal(enriched.length, base.length);
  assert.deepEqual(enriched[0].associatedIssues, [issueA, issueC], 'r1 gets issues from map');
  assert.deepEqual(enriched[3].associatedIssues, [issueB], 'r4 gets issues from map');
}

function testGetRunsWithIssuesPreservesExisting(): void {
  const runsWithExisting: FuzzingRun[] = [
    makeRun({ id: 'r1', status: 'failed', associatedIssues: [issueA] }),
  ];
  const emptyMap = new Map<string, RunIssueLink[]>();
  const result = getRunsWithIssues(runsWithExisting, emptyMap);
  assert.deepEqual(result[0].associatedIssues, [issueA], 'existing issues preserved when not in map');
}

function testGetRunsWithIssuesEmptyMap(): void {
  const emptyMap = new Map<string, RunIssueLink[]>();
  const result = getRunsWithIssues(base, emptyMap);
  assert.deepEqual(
    result.map((r) => r.id),
    base.map((r) => r.id),
  );
}

function testGetRunsWithIssuesDoesNotMutateOriginal(): void {
  const issueMap = new Map<string, RunIssueLink[]>();
  issueMap.set('r1', [issueA]);
  const originalIssues = base[0].associatedIssues;
  const enriched = getRunsWithIssues(base, issueMap);
  assert.equal(base[0].associatedIssues, originalIssues, 'original run not mutated');
  assert.notEqual(enriched[0].associatedIssues, originalIssues, 'enriched run has new reference');
}

// ---------------------------------------------------------------------------
// getIssueCounts
// ---------------------------------------------------------------------------

function testGetIssueCountsNormal(): void {
  const runsWithIssues: FuzzingRun[] = [
    makeRun({ id: 'r1', associatedIssues: [issueA, issueC] }),
    makeRun({ id: 'r2', associatedIssues: [] }),
    makeRun({ id: 'r4', associatedIssues: [issueB] }),
  ];
  assert.equal(getIssueCounts(runsWithIssues), 3);
}

function testGetIssueCountsZero(): void {
  assert.equal(getIssueCounts(base), 0);
}

function testGetIssueCountsEmptyArray(): void {
  assert.equal(getIssueCounts([]), 0);
}

function testGetIssueCountsUndefinedIssues(): void {
  const runs: FuzzingRun[] = [
    makeRun({ id: 'r1' }),
  ];
  assert.equal(getIssueCounts(runs), 0);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testColumnRunsFailed();
testColumnRunsActive();
testColumnRunsCancelled();
testColumnRunsEmptyArray();
testColumnRunsNoMatches();

testColumnCountsNormal();
testColumnCountsEmpty();
testColumnCountsUnknownStatus();

testGetRunsWithIssuesMergesFromMap();
testGetRunsWithIssuesPreservesExisting();
testGetRunsWithIssuesEmptyMap();
testGetRunsWithIssuesDoesNotMutateOriginal();

testGetIssueCountsNormal();
testGetIssueCountsZero();
testGetIssueCountsEmptyArray();
testGetIssueCountsUndefinedIssues();

console.log('triage-board-utils.test.ts: all assertions passed');
