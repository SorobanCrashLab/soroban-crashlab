import * as assert from 'node:assert/strict';
import { toggleSanityCheck, calculatePipelineStats, createNewPipelineRun, SanityCheck } from './sanity-check-utils';

const initialChecks: SanityCheck[] = [
  {
    id: 'contract-compilation',
    name: 'Contract Compilation',
    description: 'Verify contracts compile',
    category: 'contract',
    status: 'passed',
    duration: 1000,
    enabled: true,
  },
  {
    id: 'stellar-network',
    name: 'Network',
    description: 'Check connection',
    category: 'environment',
    status: 'warning',
    duration: 500,
    enabled: true,
  },
  {
    id: 'size-limits',
    name: 'Size Limits',
    description: 'Ensure size limits',
    category: 'contract',
    status: 'failed',
    duration: 100,
    enabled: false, // Edge case: disabled failure
  }
];

const runAssertions = (): void => {
  // Test toggle
  const toggled = toggleSanityCheck(initialChecks, 'size-limits');
  assert.equal(toggled[2].enabled, true);
  assert.equal(initialChecks[2].enabled, false);

  // Test pipeline stats calculation
  const stats = calculatePipelineStats(initialChecks);
  assert.equal(stats.totalChecks, 2, 'Should only count enabled checks');
  assert.equal(stats.passedChecks, 1);
  assert.equal(stats.warningChecks, 1);
  assert.equal(stats.failedChecks, 0, 'Disabled failed check should not be counted');
  assert.equal(stats.status, 'warning');

  // Edge case: when the failed check is enabled, status should be failed
  const statsWithFailure = calculatePipelineStats(toggled);
  assert.equal(statsWithFailure.totalChecks, 3);
  assert.equal(statsWithFailure.failedChecks, 1);
  assert.equal(statsWithFailure.status, 'failed');

  // Edge case: no enabled checks
  const allDisabled = initialChecks.map(c => ({ ...c, enabled: false }));
  const statsEmpty = calculatePipelineStats(allDisabled);
  assert.equal(statsEmpty.totalChecks, 0);
  assert.equal(statsEmpty.status, 'idle');

  // Test creating new run
  const now = new Date();
  const run = createNewPipelineRun(initialChecks, 'run-123', now, now);
  assert.equal(run.id, 'run-123');
  assert.equal(run.totalChecks, 2);
  assert.equal(run.status, 'warning');
};

runAssertions();
console.log('sanity-check-utils.test.ts: all assertions passed');
