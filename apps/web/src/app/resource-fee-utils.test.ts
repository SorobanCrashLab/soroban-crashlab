import * as assert from 'node:assert/strict';
import type { FuzzingRun } from './types';
import {
  RESOURCE_THRESHOLDS,
  classifyResourceLevel,
  isExpensiveRun,
  parseContractCall,
  groupRunsByContractCall,
} from './resource-fee-utils';

const baseRun = (overrides: Partial<FuzzingRun> = {}): FuzzingRun => ({
  id: 'run-1',
  status: 'failed',
  area: 'auth',
  severity: 'high',
  duration: 1000,
  seedCount: 100,
  crashDetail: {
    failureCategory: 'Panic',
    signature: 'sig:test',
    payload: JSON.stringify({ contract: 'token', method: 'transfer' }),
    replayAction: 'replay',
  },
  cpuInstructions: 500_000,
  memoryBytes: 2_000_000,
  minResourceFee: 2500,
  ...overrides,
});

assert.equal(classifyResourceLevel(5_000_000, 900_000, 5_000_000), 'critical');
assert.equal(isExpensiveRun(baseRun({ minResourceFee: RESOURCE_THRESHOLDS.feeCritical })), true);
assert.deepEqual(parseContractCall(baseRun()), { contract: 'token', method: 'transfer' });
assert.equal(groupRunsByContractCall([baseRun(), baseRun({ id: 'run-2', minResourceFee: 4000 })]).length, 1);

console.log('resource-fee-utils.test.ts: all assertions passed');
