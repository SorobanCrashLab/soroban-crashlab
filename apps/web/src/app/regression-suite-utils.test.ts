import { strict as assert } from 'node:assert';
import {
  buildMatrixCsv, compareOutcomes, createInMemorySuiteGateway, createSuite,
  deterministicMockReplay, executeSuite, filterMatrix, saveSuite,
} from './regression-suite-utils';
import type { FuzzingRun } from './types';

const run = (id: string, status: FuzzingRun['status']): FuzzingRun => ({ id, status, area: 'state', severity: 'high', duration: 1, seedCount: 1, cpuInstructions: 1, memoryBytes: 1, minResourceFee: 1, crashDetail: null });

async function main(): Promise<void> {
  assert.equal(compareOutcomes('failed', 'failed'), 'failed');
  assert.equal(compareOutcomes('failed', 'passed'), 'regressed-fix');
  assert.equal(compareOutcomes('passed', 'failed'), 'regression');
  assert.equal(compareOutcomes('passed', 'passed'), 'passed');
  assert.throws(() => createSuite('s', 'Empty', []), /at least one/);
  const runs = [run('r1', 'failed'), run('r2', 'completed')];
  const suite = createSuite('s', 'Named suite', runs, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(suite.members, [{ runId: 'r1', originalOutcome: 'failed' }, { runId: 'r2', originalOutcome: 'passed' }]);
  const gateway = createInMemorySuiteGateway(); saveSuite(gateway, suite); assert.deepEqual(gateway.get('s'), suite);
  const results = await executeSuite(suite, (id) => runs.find((item) => item.id === id), deterministicMockReplay({ r1: 'passed', r2: 'failed' }));
  assert.deepEqual(results.map((result) => result.status), ['regressed-fix', 'regression']);
  assert.equal(filterMatrix(results, 'regression').length, 1);
  const missing = await executeSuite(createSuite('m', 'Missing', [runs[0]]), () => undefined, deterministicMockReplay({}));
  assert.equal(missing[0].status, 'never-ran');
  const csv = buildMatrixCsv([{ ...results[0], error: 'value, "quoted"\nnext' }]);
  assert.match(csv, /Run ID,Original Outcome/); assert.match(csv, /"value, ""quoted""\nnext"/);
  const many = Array.from({ length: 500 }, (_, index) => run(`r-${index}`, 'failed'));
  assert.equal(createSuite('large', 'Large', many).members.length, 500);
  console.log('regression-suite-utils.test.ts: all assertions passed');
}

void main();
