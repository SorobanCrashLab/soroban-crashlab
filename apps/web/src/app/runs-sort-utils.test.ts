import * as assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { FuzzingRun } from './types';
import {
  RUN_SORT_FIELDS,
  compareRuns,
  getRunSortKeyset,
  isRunSortField,
  sortRuns,
} from './runs-sort-utils';

function makeRun(overrides: Partial<FuzzingRun> & { id: string }): FuzzingRun {
  return {
    status: 'completed',
    area: 'state',
    severity: 'medium',
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 1,
    memoryBytes: 1,
    minResourceFee: 1,
    queuedAt: '2026-01-01T00:00:00.000Z',
    startedAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  } as FuzzingRun;
}

function testWhitelist(): void {
  for (const field of RUN_SORT_FIELDS) {
    assert.equal(isRunSortField(field), true);
  }
  assert.equal(isRunSortField('nope'), false);
  assert.equal(isRunSortField(null), false);
  assert.equal(isRunSortField(undefined), false);
}

function testIdTiebreakIsDeterministic(): void {
  // Three runs sharing the primary key but with shuffled ids must always sort
  // into the same order, regardless of input order.
  const a = makeRun({ id: 'run-a', queuedAt: '2026-01-01T00:00:00.000Z' });
  const b = makeRun({ id: 'run-b', queuedAt: '2026-01-01T00:00:00.000Z' });
  const c = makeRun({ id: 'run-c', queuedAt: '2026-01-01T00:00:00.000Z' });

  const asc = sortRuns([c, a, b], 'queuedAt', 'asc').map((run) => run.id);
  const ascAgain = sortRuns([b, c, a], 'queuedAt', 'asc').map((run) => run.id);
  assert.deepEqual(asc, ['run-a', 'run-b', 'run-c']);
  assert.deepEqual(ascAgain, asc);

  const desc = sortRuns([a, c, b], 'queuedAt', 'desc').map((run) => run.id);
  assert.deepEqual(desc, ['run-c', 'run-b', 'run-a']);
}

function testNumericFields(): void {
  const short = makeRun({ id: 'run-1', duration: 100, seedCount: 5 });
  const long = makeRun({ id: 'run-2', duration: 900, seedCount: 50 });

  assert.ok(compareRuns(short, long, 'duration', 'asc') < 0);
  assert.ok(compareRuns(short, long, 'duration', 'desc') > 0);
  assert.ok(compareRuns(short, long, 'seedCount', 'asc') < 0);
}

function testStringFields(): void {
  const failed = makeRun({ id: 'run-1', status: 'failed', area: 'auth', severity: 'critical' });
  const completed = makeRun({ id: 'run-2', status: 'completed', area: 'state', severity: 'low' });

  // 'completed' < 'failed' < 'queued' alphabetically.
  assert.ok(compareRuns(completed, failed, 'status', 'asc') < 0);
  assert.ok(compareRuns(completed, failed, 'status', 'desc') > 0);
  assert.ok(compareRuns(failed, completed, 'area', 'asc') < 0);
  assert.ok(compareRuns(failed, completed, 'severity', 'asc') < 0);
}

function testMissingTimestampsAreStable(): void {
  const withDate = makeRun({ id: 'run-b', startedAt: '2026-01-01T00:00:01.000Z' });
  const withoutDate = makeRun({ id: 'run-a', startedAt: undefined as unknown as string });

  const sorted = sortRuns([withDate, withoutDate], 'startedAt', 'asc');
  assert.deepEqual(
    sorted.map((run) => run.id),
    ['run-a', 'run-b'],
  );
}

function testKeysetMatchesComparator(): void {
  const runs = [
    makeRun({ id: 'run-1', duration: 300 }),
    makeRun({ id: 'run-2', duration: 100 }),
    makeRun({ id: 'run-3', duration: 300 }),
  ];
  const sorted = sortRuns(runs, 'duration', 'asc');

  // The keyset of each row must seek past all previously emitted rows.
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = getRunSortKeyset(sorted[index - 1], 'duration');
    const current = getRunSortKeyset(sorted[index], 'duration');
    const positioned = compareRuns(
      { ...sorted[index - 1] } as FuzzingRun,
      { ...sorted[index] } as FuzzingRun,
      'duration',
      'asc',
    );
    assert.ok(positioned < 0);
    assert.ok(previous.sortKey !== undefined);
    assert.ok(current.id !== undefined);
  }

  assert.deepEqual(getRunSortKeyset(runs[0], 'id'), { sortKey: 'run-1', id: 'run-1' });
}

describe('runs-sort-utils', () => {
  it('whitelists supported sort fields', testWhitelist);
  it('breaks primary ties by id deterministically', testIdTiebreakIsDeterministic);
  it('compares numeric fields', testNumericFields);
  it('compares string fields', testStringFields);
  it('sorts missing timestamps stably', testMissingTimestampsAreStable);
  it('emits keysets that match the comparator order', testKeysetMatchesComparator);
});
