import * as assert from 'node:assert/strict';
import type { FuzzingRun } from './types';
import {
  applyBulkActionToRuns,
  canPerformBulkAction,
  getBulkActionDescription,
  getSelectedRuns,
  shouldClearSelectionAfterAction,
  toggleAllRunSelection,
  toggleRunSelection,
} from './runs-bulk-actions-utils';

const sampleRuns: FuzzingRun[] = [
  {
    id: 'run-1',
    status: 'running',
    area: 'auth',
    severity: 'high',
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 200,
    minResourceFee: 100,
    tags: [],
  },
  {
    id: 'run-2',
    status: 'failed',
    area: 'state',
    severity: 'critical',
    duration: 2000,
    seedCount: 20,
    crashDetail: null,
    cpuInstructions: 200,
    memoryBytes: 300,
    minResourceFee: 200,
    tags: [],
  },
  {
    id: 'run-3',
    status: 'completed',
    area: 'budget',
    severity: 'low',
    duration: 3000,
    seedCount: 30,
    crashDetail: null,
    cpuInstructions: 300,
    memoryBytes: 400,
    minResourceFee: 300,
    tags: [],
  },
];

function testToggleRunSelection() {
  const first = toggleRunSelection(new Set(), 'run-1');
  assert.deepEqual([...first], ['run-1']);

  const second = toggleRunSelection(first, 'run-1');
  assert.equal(second.size, 0);
}

function testToggleAllRunSelection() {
  const visible = ['run-1', 'run-2'];
  const selected = toggleAllRunSelection(new Set(), visible);
  assert.deepEqual([...selected].sort(), ['run-1', 'run-2']);

  const cleared = toggleAllRunSelection(selected, visible);
  assert.equal(cleared.size, 0);
}

function testGetSelectedRuns() {
  const selected = new Set(['run-1', 'run-3']);
  const result = getSelectedRuns(sampleRuns, selected);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((run) => run.id), ['run-1', 'run-3']);
}

function testCanPerformBulkAction() {
  assert.equal(canPerformBulkAction('cancel', [sampleRuns[0]]), true);
  assert.equal(canPerformBulkAction('cancel', [sampleRuns[2]]), false);
  assert.equal(canPerformBulkAction('retry', [sampleRuns[1]]), true);
  assert.equal(canPerformBulkAction('delete', [sampleRuns[2]]), true);
  assert.equal(canPerformBulkAction('export', sampleRuns), true);
  assert.equal(canPerformBulkAction('tag', []), false);
}

function testApplyBulkActionToRuns() {
  const cancelled = applyBulkActionToRuns(sampleRuns, 'cancel', ['run-1']);
  assert.equal(cancelled[0].status, 'cancelled');

  const retried = applyBulkActionToRuns(sampleRuns, 'retry', ['run-2']);
  assert.equal(retried[1].status, 'running');

  const deleted = applyBulkActionToRuns(sampleRuns, 'delete', ['run-3']);
  assert.equal(deleted.length, 2);
  assert.ok(!deleted.some((run) => run.id === 'run-3'));
}

function testShouldClearSelectionAfterAction() {
  assert.equal(shouldClearSelectionAfterAction('export'), false);
  assert.equal(shouldClearSelectionAfterAction('delete'), true);
}

function testGetBulkActionDescription() {
  assert.match(getBulkActionDescription('cancel'), /Cancel/);
  assert.match(getBulkActionDescription('export'), /Export/);
}

function runAllTests() {
  testToggleRunSelection();
  testToggleAllRunSelection();
  testGetSelectedRuns();
  testCanPerformBulkAction();
  testApplyBulkActionToRuns();
  testShouldClearSelectionAfterAction();
  testGetBulkActionDescription();
  console.log('runs-bulk-actions-utils.test.ts: all assertions passed');
}

runAllTests();
