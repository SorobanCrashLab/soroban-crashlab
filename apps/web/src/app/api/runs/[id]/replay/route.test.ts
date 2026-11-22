import * as assert from 'node:assert/strict';
import type { FuzzingRun } from '../../../../types';
import {
  buildReplayBundleDocument,
  buildReplayCliInvocation,
  serializeReplayBundleDocument,
} from './route';

const run: FuzzingRun = {
  id: 'run-1234',
  status: 'failed',
  area: 'state',
  severity: 'high',
  duration: 1200,
  seedCount: 42,
  crashDetail: {
    failureCategory: 'Panic',
    signature: 'sig:demo:replay',
    signatureHash: 123456,
    payload: JSON.stringify({ contract: 'vault', method: 'rebalance', args: { amount: 7 } }),
    replayAction: 'cargo run --bin crash-replay -- --run-id run-1234',
  },
  cpuInstructions: 1000,
  memoryBytes: 2048,
  minResourceFee: 12,
  queuedAt: '2026-01-01T00:00:00.000Z',
  startedAt: '2026-01-01T00:00:01.000Z',
  finishedAt: '2026-01-01T00:00:02.000Z',
  associatedIssues: [],
  annotations: [],
};

const document = buildReplayBundleDocument(run);

assert.equal(document.schema, 2);
assert.equal(document.seed.id, 1234);
assert.ok(document.seed.payload.length > 0);
assert.equal(document.failure_payload.length, document.seed.payload.length);
assert.equal(typeof document.signature.digest, 'bigint');
assert.equal(typeof document.signature.signature_hash, 'bigint');

const json = serializeReplayBundleDocument(document);
assert.match(json, /"schema": 2/);
assert.match(json, /"seed":\s+\{/);
assert.match(json, /"digest": \d+/);
assert.match(json, /"signature_hash": \d+/);
assert.doesNotMatch(json, /"digest": "/);
assert.doesNotMatch(json, /"signature_hash": "/);

const invocation = buildReplayCliInvocation('/tmp/crashlab-replay/demo.json');
assert.equal(invocation.command, 'cargo');
assert.deepEqual(invocation.args.slice(0, 6), [
  'run',
  '--quiet',
  '--manifest-path',
  invocation.args[3],
  '--bin',
  'crashlab',
]);
assert.equal(invocation.args[invocation.args.length - 3], 'replay');
assert.equal(invocation.args[invocation.args.length - 2], 'seed');
assert.equal(invocation.args[invocation.args.length - 1], '/tmp/crashlab-replay/demo.json');

console.log('route.test.ts: all assertions passed');