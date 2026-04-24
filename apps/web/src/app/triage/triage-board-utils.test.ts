import * as assert from 'node:assert/strict';
import {
  TRIAGE_COLUMNS,
  getColumnRuns,
  getColumnCounts,
} from './triage-board-utils';
import type { FuzzingRun } from '../types';

const base: FuzzingRun[] = [
  { id: 'r1', status: 'failed',    area: 'auth',   severity: 'high',   duration: 1000, seedCount: 100, cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0, crashDetail: null },
  { id: 'r2', status: 'running',   area: 'state',  severity: 'low',    duration: 2000, seedCount: 200, cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0, crashDetail: null },
  { id: 'r3', status: 'cancelled', area: 'budget', severity: 'medium', duration: 500,  seedCount: 50,  cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0, crashDetail: null },
  { id: 'r4', status: 'failed',    area: 'xdr',    severity: 'critical', duration: 3000, seedCount: 300, cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0, crashDetail: null },
  { id: 'r5', status: 'completed', area: 'auth',   severity: 'low',    duration: 4000, seedCount: 400, cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0, crashDetail: null },
];

// getColumnRuns – failed column
assert.deepEqual(
  getColumnRuns(base, TRIAGE_COLUMNS[0]).map((r) => r.id),
  ['r1', 'r4'],
);

// getColumnRuns – active column
assert.deepEqual(
  getColumnRuns(base, TRIAGE_COLUMNS[1]).map((r) => r.id),
  ['r2'],
);

// getColumnRuns – cancelled column
assert.deepEqual(
  getColumnRuns(base, TRIAGE_COLUMNS[2]).map((r) => r.id),
  ['r3'],
);

// getColumnCounts
assert.deepEqual(getColumnCounts(base), { failed: 2, active: 1, cancelled: 1 });

// edge case: empty runs
assert.deepEqual(getColumnCounts([]), { failed: 0, active: 0, cancelled: 0 });

console.log('triage-board-utils.test.ts: all assertions passed');
