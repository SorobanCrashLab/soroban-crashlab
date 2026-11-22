/**
 * Tests for the run timeline dedupe helpers (#1076).
 *
 * The timelines render one row per run keyed on `run.id`, so a `runs` prop with
 * repeated ids triggered React's "two children with the same key" warning.
 */
import * as assert from 'node:assert/strict';
import { dedupeRunsById, hasDuplicateIds } from './run-timeline-utils';
import type { FuzzingRun } from './types';

function makeRun(id: string, overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  const startedAt = new Date('2024-01-15T10:00:00Z').toISOString();
  return {
    id,
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 120000,
    seedCount: 10000,
    crashDetail: null,
    cpuInstructions: 500000,
    memoryBytes: 2000000,
    minResourceFee: 1000,
    startedAt,
    finishedAt: new Date(new Date(startedAt).getTime() + 120000).toISOString(),
    ...overrides,
  };
}

function testDetectsDuplicates(): void {
  assert.equal(hasDuplicateIds([makeRun('run-1'), makeRun('run-2')]), false);
  assert.equal(hasDuplicateIds([makeRun('run-1'), makeRun('run-1')]), true);
  assert.equal(hasDuplicateIds([]), false);
}

function testDedupeRemovesRepeatedIds(): void {
  // The reported case: a polled run merged over an already-loaded page.
  const runs = [makeRun('run-1'), makeRun('run-2'), makeRun('run-1'), makeRun('run-3')];
  assert.equal(hasDuplicateIds(runs), true);

  const deduped = dedupeRunsById(runs);
  assert.equal(hasDuplicateIds(deduped), false);
  assert.deepEqual(
    deduped.map((r) => r.id),
    ['run-1', 'run-2', 'run-3'],
  );

  // Keys derived from the result are unique, which is what React requires.
  const keys = deduped.map((r) => r.id);
  assert.equal(new Set(keys).size, keys.length);
}

function testKeepsFirstOccurrence(): void {
  // Callers prepend freshly polled runs, so the first copy holds the newest data.
  const fresh = makeRun('run-1', { status: 'running', seedCount: 42 });
  const stale = makeRun('run-1', { status: 'completed', seedCount: 7 });

  const deduped = dedupeRunsById([fresh, stale]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].status, 'running');
  assert.equal(deduped[0].seedCount, 42);
}

function testPreservesOrderAndIsImmutable(): void {
  const runs = [makeRun('c'), makeRun('a'), makeRun('b')];
  assert.deepEqual(
    dedupeRunsById(runs).map((r) => r.id),
    ['c', 'a', 'b'],
  );

  // The input array is untouched (it is a prop shared with other components).
  const original = [makeRun('run-1'), makeRun('run-1')];
  const result = dedupeRunsById(original);
  assert.equal(original.length, 2);
  assert.notEqual(result, original);
}

function testEdgeCases(): void {
  assert.deepEqual(dedupeRunsById([]), []);

  // All-identical ids collapse to a single row.
  const allSame = [makeRun('run-1'), makeRun('run-1'), makeRun('run-1')];
  assert.equal(dedupeRunsById(allSame).length, 1);
}

// Mirrors the slice performed by the timelines: deduping first means the visible
// window really does contain N distinct runs.
function testDedupeBeforeSlice(): void {
  const runs = [
    makeRun('run-1'),
    makeRun('run-1'),
    makeRun('run-2'),
    makeRun('run-2'),
    makeRun('run-3'),
  ];

  const visible = dedupeRunsById(runs).slice(0, 3);
  assert.deepEqual(
    visible.map((r) => r.id),
    ['run-1', 'run-2', 'run-3'],
  );

  // Slicing first (the old order) would have shown only two distinct runs.
  const sliceFirst = runs.slice(0, 3);
  assert.equal(hasDuplicateIds(sliceFirst), true);
  assert.equal(new Set(sliceFirst.map((r) => r.id)).size, 2);
}

testDetectsDuplicates();
testDedupeRemovesRepeatedIds();
testKeepsFirstOccurrence();
testPreservesOrderAndIsImmutable();
testEdgeCases();
testDedupeBeforeSlice();

console.log('run-timeline-utils.test.ts: all assertions passed');
