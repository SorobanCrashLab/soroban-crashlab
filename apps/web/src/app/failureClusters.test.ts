import * as assert from 'node:assert/strict';
import { buildFailureClusters, describeFailureCluster } from './failureClusters';
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

const runAssertions = (): void => {
  const clusters = buildFailureClusters([
    makeRun({ id: 'run-3' }),
    makeRun({ id: 'run-2' }),
    makeRun({ id: 'run-1', area: 'state' }),
    makeRun({ id: 'run-0', status: 'completed', crashDetail: null }),
  ]);

  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].representativeRunId, 'run-3');
  assert.equal(clusters[0].count, 2);
  assert.deepEqual(clusters[0].relatedRunIds, ['run-3', 'run-2']);
  assert.equal(clusters[1].count, 1);

  const [cluster] = buildFailureClusters([
    makeRun({ area: 'budget', severity: 'critical', crashDetail: { failureCategory: 'Panic', signature: 'sig:router:swap:budget_cpu_limit', payload: '{}', replayAction: 'cargo run' } }),
  ]);

  assert.equal(describeFailureCluster(cluster), 'Panic in Budget (critical)');
};

runAssertions();
console.log('failureClusters.test.ts: all assertions passed');
