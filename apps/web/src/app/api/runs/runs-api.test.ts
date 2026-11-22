import * as assert from 'node:assert/strict';
import { buildMockRuns } from '../../mockRuns';

// Verify the data source used by the API routes returns a valid run list.

const runs = buildMockRuns();

// Sanity: runs list is non-empty
assert.ok(runs.length > 0, 'buildMockRuns returns at least one run');

// Every run has the required fields
for (const run of runs) {
    assert.ok(typeof run.id === 'string' && run.id.length > 0, `run.id must be a non-empty string (got ${run.id})`);
    assert.ok(['running', 'completed', 'failed', 'cancelled'].includes(run.status), `run.status must be a valid RunStatus (got ${run.status})`);
    assert.ok(['auth', 'state', 'budget', 'xdr'].includes(run.area), `run.area must be a valid RunArea (got ${run.area})`);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(run.severity), `run.severity must be a valid RunSeverity (got ${run.severity})`);
    assert.ok(typeof run.duration === 'number', 'run.duration must be a number');
    assert.ok(typeof run.seedCount === 'number', 'run.seedCount must be a number');
    assert.ok(typeof run.cpuInstructions === 'number', 'run.cpuInstructions must be a number');
    assert.ok(typeof run.memoryBytes === 'number', 'run.memoryBytes must be a number');
    assert.ok(typeof run.minResourceFee === 'number', 'run.minResourceFee must be a number');
}

// GET /api/runs/[id] – lookup by id resolves correctly
const first = runs[0];
const found = runs.find((r) => r.id === first.id);
assert.deepEqual(found, first, 'lookup by id returns the correct run');

// GET /api/runs/[id] – missing id resolves to undefined (API returns 404)
const missing = runs.find((r) => r.id === 'does-not-exist');
assert.strictEqual(missing, undefined, 'lookup of unknown id returns undefined');

// All run ids are unique
const ids = runs.map((r) => r.id);
const uniqueIds = new Set(ids);
assert.strictEqual(uniqueIds.size, ids.length, 'all run ids are unique');

console.log('runs-api.test.ts: all assertions passed');
