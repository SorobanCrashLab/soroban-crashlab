import * as assert from 'node:assert/strict';
import { simulateSeedReplay } from './replay';
import {
  createReplayPlaceholderRun,
  getReplayButtonLabel,
  getRunLineageLabel,
  getRunLineagePath,
  type ReplayActionData,
  type ReplayButtonStatus,
} from './replay-ui-utils';

function testGetReplayButtonLabel() {
  assert.equal(getReplayButtonLabel('idle'), 'Replay');
  assert.equal(getReplayButtonLabel('loading'), 'Replaying...');
  assert.equal(getReplayButtonLabel('success'), 'Replay queued');
  assert.equal(getReplayButtonLabel('error'), 'Retry replay');

  const statuses: ReplayButtonStatus[] = ['idle', 'loading', 'success', 'error'];
  const labels = statuses.map((status) => getReplayButtonLabel(status));
  assert.deepEqual(labels, ['Replay', 'Replaying...', 'Replay queued', 'Retry replay']);
}

function testCreateReplayPlaceholderRun() {
  const data: ReplayActionData = { id: 'replay-run-1', status: 'running' };
  const run = createReplayPlaceholderRun(data);

  assert.equal(run.id, 'replay-run-1');
  assert.equal(run.status, 'running');
  assert.equal(run.area, 'state');
  assert.equal(run.severity, 'medium');

  const defaultRun = createReplayPlaceholderRun({ id: 'replay-run-2', status: 'running' });
  assert.equal(defaultRun.duration, 0);
  assert.equal(defaultRun.seedCount, 0);
  assert.equal(defaultRun.cpuInstructions, 0);
  assert.equal(defaultRun.memoryBytes, 0);
  assert.equal(defaultRun.minResourceFee, 0);
  assert.equal(defaultRun.crashDetail, null);
}

async function testReplayServiceMapping() {
  const originalFetch = globalThis.fetch;
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(input).includes('/api/runs/run-42/replay'));
    assert.equal(init?.method, 'POST');

    return new Response(
      JSON.stringify({
        ok: true,
        runId: 'run-42',
        newRunId: 'replay-run-42-abc12345',
        command: 'cargo',
        args: ['run'],
        stdout: '',
        stderr: '',
        exitCode: 0,
        bundleJson: '{}',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  globalThis.fetch = fetchMock as typeof globalThis.fetch;

  try {
    const replayResult = await simulateSeedReplay('run-42');
    const run = createReplayPlaceholderRun({
      id: replayResult.newRunId,
      status: 'running',
    });

    assert.ok(run.id.startsWith('replay-run-42-'));
    assert.equal(run.status, 'running');
    assert.equal(run.crashDetail, null);
    assert.equal(run.area, 'state');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testSeedSubsetReplayMetadata() {
  const first = simulateSeedReplay('run-42', [9, 1, 1, 7]);
  const second = simulateSeedReplay('run-42', [1, 7, 9]);

  assert.deepEqual(first.seedList, [1, 7, 9]);
  assert.deepEqual(second.seedList, [1, 7, 9]);
  assert.equal(first.newRunId, second.newRunId);
  assert.equal(first.parentId, undefined);

  const child = simulateSeedReplay('run-42', [3, 4], 'run-42');
  assert.deepEqual(child.seedList, [3, 4]);
  assert.equal(child.parentId, 'run-42');
  assert.equal(child.newRunId, 'replay-run-42-seed-3-4');
}

function testLineageTraversal() {
  const root = { id: 'run-1', status: 'completed', area: 'auth', severity: 'medium', duration: 0, seedCount: 10, crashDetail: null, cpuInstructions: 0, memoryBytes: 0, minResourceFee: 0 };
  const child = { ...root, id: 'run-2', parentId: 'run-1', seedList: [1, 2, 3] };
  const grandChild = { ...root, id: 'run-3', parentId: 'run-2', seedList: [3] };
  const greatGrandChild = { ...root, id: 'run-4', parentId: 'run-3', seedList: [3, 4] };

  assert.equal(getRunLineageLabel(child), 'child of #1 · 3 seeds');
  assert.deepEqual(getRunLineagePath(greatGrandChild, [root, child, grandChild, greatGrandChild]), ['run-1', 'run-2', 'run-3', 'run-4']);
}

async function main() {
  testGetReplayButtonLabel();
  testCreateReplayPlaceholderRun();
  await testReplayServiceMapping();
  testSeedSubsetReplayMetadata();
  testLineageTraversal();
  console.log('replay-ui-utils.test.ts: all assertions passed');
}

void main();