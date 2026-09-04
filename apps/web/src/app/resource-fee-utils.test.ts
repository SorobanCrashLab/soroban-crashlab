import * as assert from 'node:assert/strict';
import type { FuzzingRun } from './types';
import {
  RESOURCE_THRESHOLDS,
  classifyResourceLevel,
  isExpensiveRun,
  parseContractCall,
  groupRunsByContractCall,
  sanitizeFeeSeries,
  isValidFeeValue,
  FEE_Y_DOMAIN,
  getFeeYDomain,
  formatMalformedFeeCaption,
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

// — sanitizeFeeSeries: pure, no chart imports ———————————————————
{
  // helper to build rows with arbitrary fee values (including malformed)
  const makeRow = (id: string, fee: unknown): FuzzingRun => baseRun({ id, minResourceFee: fee as number });

  // negative => dropped
  {
    const rows = [makeRow('run-neg', -5), makeRow('run-ok', 100)];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(clean[0].id, 'run-ok');
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-neg']);
    assert.equal(isValidFeeValue(-5), false);
  }

  // NaN => dropped
  {
    const rows = [makeRow('run-nan', NaN), makeRow('run-ok2', 200)];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-nan']);
    assert.equal(isValidFeeValue(NaN), false);
  }

  // Infinity / -Infinity => dropped
  {
    const rows = [makeRow('run-inf', Infinity), makeRow('run-ninf', -Infinity), makeRow('run-ok3', 300)];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 2);
    assert.deepEqual(dropped.ids, ['run-inf', 'run-ninf']);
    assert.equal(isValidFeeValue(Infinity), false);
    assert.equal(isValidFeeValue(-Infinity), false);
  }

  // string-number => dropped (non-number)
  {
    const rows = [
      baseRun({ id: 'run-str', minResourceFee: '100' as unknown as number }),
      makeRow('run-ok4', 400),
    ];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 1);
    assert.deepEqual(dropped.ids, ['run-str']);
    assert.equal(isValidFeeValue('100'), false);
    assert.equal(isValidFeeValue('500'), false);
  }

  // huge-but-valid => kept
  {
    const huge = 1_000_000_000;
    const rows = [makeRow('run-huge', huge), makeRow('run-max', Number.MAX_SAFE_INTEGER)];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 2);
    assert.equal(dropped.count, 0);
    assert.equal(isValidFeeValue(huge), true);
    assert.equal(isValidFeeValue(Number.MAX_SAFE_INTEGER), true);
  }

  // zero => valid kept (boundary)
  {
    const rows = [makeRow('run-zero', 0)];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(dropped.count, 0);
    assert.equal(isValidFeeValue(0), true);
  }

  // multiple malformed with correct dropped count and ids for caption/tooltip
  {
    const rows = [
      makeRow('run-a', -10),
      makeRow('run-b', NaN),
      { ...makeRow('run-c', 123), minResourceFee: null as unknown as number },
      makeRow('run-d', 500),
    ];
    const { clean, dropped } = sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(clean.length, 1);
    assert.equal(clean[0].id, 'run-d');
    assert.equal(dropped.count, 3);
    assert.deepEqual(dropped.ids, ['run-a', 'run-b', 'run-c']);
    const caption = formatMalformedFeeCaption(dropped.count);
    assert.equal(caption, '3 malformed fee rows hidden');
    // single row caption grammar
    assert.equal(formatMalformedFeeCaption(1), '1 malformed fee row hidden');
    assert.equal(formatMalformedFeeCaption(0), null);
  }

  // does not mutate input
  {
    const rows = [makeRow('run-orig', -1), makeRow('run-keep', 10)];
    const origLen = rows.length;
    sanitizeFeeSeries(rows as unknown as FuzzingRun[]);
    assert.equal(rows.length, origLen);
  }

  // Y-axis never extends below zero for fee metrics
  {
    assert.deepEqual([...FEE_Y_DOMAIN], [0, 'auto']);
    assert.deepEqual([...getFeeYDomain()], [0, 'auto']);
    assert.equal(FEE_Y_DOMAIN[0], 0);
  }
}

console.log('resource-fee-utils.test.ts: all assertions passed');
