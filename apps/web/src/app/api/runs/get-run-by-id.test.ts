import * as assert from 'node:assert/strict';
import { buildMockRuns } from '../../mockRuns';
import type { FuzzingRun } from '../../types';

const VALID_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);
const VALID_AREAS = new Set(['auth', 'state', 'budget', 'xdr']);
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function findRunById(id: string): FuzzingRun | undefined {
  return buildMockRuns().find((r) => r.id === id);
}

const runAssertions = () => {
  // known run exists
  const run = findRunById('run-1000');
  assert.ok(run !== undefined, 'run-1000 should be present in mock data');
  assert.equal(run.id, 'run-1000');
  assert.ok(VALID_STATUSES.has(run.status), `unexpected status: ${run.status}`);
  assert.ok(VALID_AREAS.has(run.area), `unexpected area: ${run.area}`);
  assert.ok(VALID_SEVERITIES.has(run.severity), `unexpected severity: ${run.severity}`);
  assert.equal(typeof run.duration, 'number');
  assert.equal(typeof run.seedCount, 'number');
  assert.equal(typeof run.cpuInstructions, 'number');
  assert.equal(typeof run.memoryBytes, 'number');
  assert.equal(typeof run.minResourceFee, 'number');

  // another known run exists
  const run2 = findRunById('run-1024');
  assert.ok(run2 !== undefined, 'run-1024 should be present in mock data');

  // missing run returns undefined (→ 404 in the handler)
  const missing = findRunById('run-9999');
  assert.equal(missing, undefined, 'non-existent run should return undefined');

  // all runs satisfy the FuzzingRun shape requirements
  const all = buildMockRuns();
  assert.ok(all.length > 0, 'mock dataset must be non-empty');
  for (const r of all) {
    assert.equal(typeof r.id, 'string');
    assert.ok(VALID_STATUSES.has(r.status));
    assert.ok(VALID_AREAS.has(r.area));
    assert.ok(VALID_SEVERITIES.has(r.severity));
    assert.equal(typeof r.cpuInstructions, 'number');
    assert.equal(typeof r.memoryBytes, 'number');
    assert.equal(typeof r.minResourceFee, 'number');
    assert.ok(r.crashDetail === null || typeof r.crashDetail === 'object');
  }

  // failed runs carry a crashDetail payload
  const failedRuns = all.filter((r) => r.status === 'failed');
  assert.ok(failedRuns.length > 0, 'mock dataset must contain at least one failed run');
  for (const r of failedRuns) {
    assert.ok(r.crashDetail !== null, `failed run ${r.id} must have crashDetail`);
    assert.equal(typeof r.crashDetail!.signature, 'string');
    assert.equal(typeof r.crashDetail!.replayAction, 'string');
  }
};

runAssertions();
console.log('get-run-by-id.test.ts: all assertions passed');
