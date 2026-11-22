/**
 * Golden-equality test for the incremental clustering pipeline (#1391).
 *
 * Proves the new hash-bucket + intra-bucket-refine implementation produces
 * output bit-for-bit identical to the legacy exact-key clustering, so
 * similarity semantics are unchanged for existing datasets.
 */

import * as assert from 'node:assert/strict';
import { buildFailureClusters, buildFailureClustersLegacy } from './failureClusters';
import { FuzzingRun } from './types';

const makeRun = (overrides: Partial<FuzzingRun>): FuzzingRun => ({
  id: 'run-default',
  status: 'failed',
  area: 'auth',
  severity: 'high',
  duration: 1,
  seedCount: 1,
  cpuInstructions: 1,
  memoryBytes: 1,
  minResourceFee: 1,
  crashDetail: {
    failureCategory: 'InvariantViolation',
    signature: 'sig:token:transfer:assert_balance_nonnegative',
    payload: '{}',
    replayAction: 'cargo run --bin crash-replay',
  },
  ...overrides,
});

function smallCorpus(): FuzzingRun[] {
  return [
    makeRun({ id: 'a1', crashDetail: { failureCategory: 'C', signature: 'sA', payload: '{}', replayAction: 'x' } }),
    makeRun({ id: 'a2', crashDetail: { failureCategory: 'C', signature: 'sA', payload: '{}', replayAction: 'x' } }),
    // different area -> different key
    makeRun({ id: 'a3', area: 'state', crashDetail: { failureCategory: 'C', signature: 'sA', payload: '{}', replayAction: 'x' } }),
    // different category -> different key
    makeRun({ id: 'a4', crashDetail: { failureCategory: 'D', signature: 'sA', payload: '{}', replayAction: 'x' } }),
    // ignored: non-failed and null crashDetail
    makeRun({ id: 'a5', status: 'completed', crashDetail: null }),
    makeRun({ id: 'a6', crashDetail: null }),
  ];
}

function testSmallGolden(): void {
  const input = smallCorpus();
  assert.deepStrictEqual(buildFailureClusters(input), buildFailureClustersLegacy(input));
  console.log('  ✓ small corpus: new pipeline == legacy (golden equality)');
}

function testLargeGolden(): void {
  // Deterministic seeded corpus to keep the golden check reproducible.
  let s = 987654321;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const areas = ['auth', 'state', 'budget', 'xdr'] as const;
  const sevs = ['low', 'medium', 'high', 'critical'] as const;
  const cats = ['C', 'D', 'E'] as const;
  const runs: FuzzingRun[] = [];
  for (let i = 0; i < 2000; i++) {
    runs.push(
      makeRun({
        id: `r${i}`,
        area: areas[Math.floor(rand() * 4)],
        severity: sevs[Math.floor(rand() * 4)],
        crashDetail: {
          failureCategory: cats[Math.floor(rand() * 3)],
          signature: `sig-${Math.floor(rand() * 50)}`,
          payload: '{}',
          replayAction: 'x',
        },
      }),
    );
  }
  assert.deepStrictEqual(buildFailureClusters(runs), buildFailureClustersLegacy(runs));
  console.log('  ✓ 2000-run seeded corpus: new pipeline == legacy (golden equality)');
}

testSmallGolden();
testLargeGolden();
console.log('failureClusters.golden.test.ts: all assertions passed');
