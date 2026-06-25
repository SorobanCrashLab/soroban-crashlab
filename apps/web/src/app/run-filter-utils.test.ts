import * as assert from 'node:assert/strict';
import {
  applyRunFilters,
  filterByArea,
  filterByCrash,
  filterBySearchTerm,
  filterBySeverity,
  filterByStatus,
} from './run-filter-utils';
import { FuzzingRun } from './types';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-001',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1024,
    minResourceFee: 0,
    ...overrides,
  };
}

const runs: FuzzingRun[] = [
  makeRun({ id: 'r1', status: 'running', area: 'auth', severity: 'low', crashDetail: null }),
  makeRun({ id: 'r2', status: 'completed', area: 'state', severity: 'high', crashDetail: null }),
  makeRun({ id: 'r3', status: 'failed', area: 'budget', severity: 'critical', crashDetail: { failureCategory: 'auth', signature: 'sig', payload: 'p', replayAction: 'r' } }),
  makeRun({ id: 'r4', status: 'cancelled', area: 'xdr', severity: 'medium', crashDetail: null }),
];

// filterByStatus
assert.deepEqual(filterByStatus(runs, []), runs);
assert.equal(filterByStatus(runs, ['running']).length, 1);
assert.equal(filterByStatus(runs, ['running'])[0].id, 'r1');
assert.equal(filterByStatus(runs, ['completed', 'failed']).length, 2);
assert.equal(filterByStatus([], ['running']).length, 0);

// filterByArea
assert.deepEqual(filterByArea(runs, []), runs);
assert.equal(filterByArea(runs, ['auth']).length, 1);
assert.equal(filterByArea(runs, ['auth'])[0].id, 'r1');
assert.equal(filterByArea(runs, ['auth', 'state']).length, 2);
assert.equal(filterByArea([], ['auth']).length, 0);

// filterBySeverity
assert.deepEqual(filterBySeverity(runs, []), runs);
assert.equal(filterBySeverity(runs, ['critical']).length, 1);
assert.equal(filterBySeverity(runs, ['critical'])[0].id, 'r3');
assert.equal(filterBySeverity(runs, ['low', 'high']).length, 2);

// filterBySearchTerm
assert.deepEqual(filterBySearchTerm(runs, ''), runs);
assert.deepEqual(filterBySearchTerm(runs, '   '), runs);
assert.equal(filterBySearchTerm(runs, 'r3').length, 1);
assert.equal(filterBySearchTerm(runs, 'R3').length, 1);  // case-insensitive
assert.equal(filterBySearchTerm(runs, 'run').length, 0);  // our ids are r1..r4
assert.equal(filterBySearchTerm([], 'r1').length, 0);

// filterByCrash
assert.deepEqual(filterByCrash(runs, null), runs);
assert.equal(filterByCrash(runs, true).length, 1);
assert.equal(filterByCrash(runs, true)[0].id, 'r3');
assert.equal(filterByCrash(runs, false).length, 3);

// applyRunFilters — combined
const result = applyRunFilters(runs, {
  status: ['failed'],
  area: ['budget'],
  severity: ['critical'],
  searchTerm: 'r3',
  hasCrash: true,
});
assert.equal(result.length, 1);
assert.equal(result[0].id, 'r3');

// applyRunFilters — empty filters returns all
assert.equal(applyRunFilters(runs, { status: [], area: [], severity: [], searchTerm: '', hasCrash: null }).length, runs.length);

// applyRunFilters — conflicting filters return empty
assert.equal(applyRunFilters(runs, { status: ['running'], area: ['xdr'], severity: [], searchTerm: '', hasCrash: null }).length, 0);

console.log('run-filter-utils.test.ts: all assertions passed');
