/**
 * Benchmark harness for incremental failure-clustering (#1391).
 *
 * Gated behind CLUSTER_BENCHMARK=1 so it never slows the normal unit gate.
 * Generates a seeded 10k-run corpus and asserts the clustering completes
 * within 500ms, printing the measured figure for the PR record.
 *
 * Run locally with:
 *   CLUSTER_BENCHMARK=1 pnpm run test:cluster-benchmark
 */

import * as assert from 'node:assert/strict';
import { buildFailureClusters } from './failureClusters';
import { FuzzingRun } from './types';

const RUN_BENCHMARK = process.env.CLUSTER_BENCHMARK === '1';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRun(id: string, overrides: Partial<FuzzingRun>): FuzzingRun {
  return {
    id,
    status: 'failed',
    area: 'auth',
    severity: 'high',
    duration: 1,
    seedCount: 1,
    cpuInstructions: 1,
    memoryBytes: 1,
    minResourceFee: 1,
    crashDetail: {
      failureCategory: 'C',
      signature: 's',
      payload: '{}',
      replayAction: 'x',
    },
    ...overrides,
  };
}

function main(): void {
  if (!RUN_BENCHMARK) {
    console.log('  ✓ cluster benchmark skipped (set CLUSTER_BENCHMARK=1 to run)');
    return;
  }

  const rand = mulberry32(42);
  const N = 10000;
  const areas = ['auth', 'state', 'budget', 'xdr'] as const;
  const sevs = ['low', 'medium', 'high', 'critical'] as const;
  const cats = ['C', 'D', 'E'] as const;

  const runs: FuzzingRun[] = [];
  for (let i = 0; i < N; i++) {
    runs.push(
      makeRun(`run-${i}`, {
        area: areas[Math.floor(rand() * 4)],
        severity: sevs[Math.floor(rand() * 4)],
        crashDetail: {
          failureCategory: cats[Math.floor(rand() * 3)],
          signature: `sig-${Math.floor(rand() * 200)}`,
          payload: '{}',
          replayAction: 'x',
        },
      }),
    );
  }

  const start = process.hrtime.bigint();
  const clusters = buildFailureClusters(runs);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;

  console.log(`  ✓ clustered ${N} runs into ${clusters.length} clusters in ${ms.toFixed(1)}ms`);
  assert.ok(ms < 500, `clustering took ${ms.toFixed(1)}ms, budget is 500ms`);
}

main();
