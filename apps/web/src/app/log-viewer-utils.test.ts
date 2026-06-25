import * as assert from 'node:assert/strict';
import {
  compareLogEntriesByTime,
  filterLogEntries,
  type LogEntry,
  type LogLevel,
} from './log-viewer-utils';

// ---------------------------------------------------------------------------
// compareLogEntriesByTime
// ---------------------------------------------------------------------------

function testCompareSameTimestamp(): void {
  const a: LogEntry = { id: 'a', timestamp: 100, level: 'info', source: 's1', message: 'm1' };
  const b: LogEntry = { id: 'b', timestamp: 100, level: 'info', source: 's1', message: 'm1' };
  assert.equal(compareLogEntriesByTime(a, b), 0, 'same timestamp yields 0');
  assert.equal(compareLogEntriesByTime(b, a), 0, 'same timestamp yields 0 (reverse)');
}

function testCompareAscending(): void {
  const early: LogEntry = { id: 'a', timestamp: 50, level: 'info', source: 's1', message: 'm1' };
  const late: LogEntry = { id: 'b', timestamp: 200, level: 'info', source: 's1', message: 'm1' };
  assert.ok(compareLogEntriesByTime(early, late) < 0, 'early < late');
  assert.ok(compareLogEntriesByTime(late, early) > 0, 'late > early');
}

function testCompareLargeTimestamps(): void {
  const a: LogEntry = { id: 'a', timestamp: 1e15, level: 'info', source: 's1', message: 'm1' };
  const b: LogEntry = { id: 'b', timestamp: 0, level: 'info', source: 's1', message: 'm1' };
  assert.ok(compareLogEntriesByTime(a, b) > 0, 'large positive');
  assert.ok(compareLogEntriesByTime(b, a) < 0, 'zero is smaller');
}

function testSortStability(): void {
  const entries: LogEntry[] = [
    { id: 'x', timestamp: 300, level: 'error', source: 'rpc', message: 'timeout' },
    { id: 'y', timestamp: 100, level: 'info', source: 'scheduler', message: 'started' },
    { id: 'z', timestamp: 200, level: 'warn', source: 'fuzz-worker', message: 'budget warning' },
  ];
  const sorted = [...entries].sort(compareLogEntriesByTime);
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['y', 'z', 'x'],
  );
}

// ---------------------------------------------------------------------------
// filterLogEntries
// ---------------------------------------------------------------------------

const base: LogEntry[] = [
  { id: '1', timestamp: 100, level: 'info',  source: 'fuzz-worker', message: 'campaign started' },
  { id: '2', timestamp: 200, level: 'warn',   source: 'rpc',         message: 'rate limit approaching' },
  { id: '3', timestamp: 150, level: 'error',   source: 'scheduler',  message: 'seed replay failed' },
  { id: '4', timestamp: 250, level: 'debug',   source: 'fuzz-worker', message: 'mutation batch 42' },
];

function testFilterAllLevelsNoQuery(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: '' }).map((e) => e.id),
    ['1', '2', '3', '4'],
  );
}

function testFilterByLevel(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'warn', query: '' }).map((e) => e.id),
    ['2'],
  );
}

function testFilterByQuery(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: 'replay' }).map((e) => e.id),
    ['3'],
  );
}

function testFilterCaseInsensitive(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: 'RPC' }).map((e) => e.id),
    ['2'],
  );
}

function testFilterCombinedLevelAndQuery(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'error', query: 'seed' }).map((e) => e.id),
    ['3'],
  );
}

function testFilterNoMatch(): void {
  assert.deepEqual(filterLogEntries(base, { level: 'info', query: 'rpc' }), []);
}

function testFilterEmptyArray(): void {
  assert.deepEqual(filterLogEntries([], { level: 'all', query: '' }), []);
  assert.deepEqual(filterLogEntries([], { level: 'error', query: 'something' }), []);
}

function testFilterQueryTrimsWhitespace(): void {
  const entries: LogEntry[] = [
    { id: '1', timestamp: 100, level: 'info', source: 'worker', message: 'hello world' },
  ];
  assert.equal(
    filterLogEntries(entries, { level: 'all', query: '  hello  ' }).length,
    1,
    'whitespace-trimmed query still matches',
  );
}

function testFilterQueryMatchesSource(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: 'scheduler' }).map((e) => e.id),
    ['3'],
  );
}

function testFilterDebugLevel(): void {
  assert.deepEqual(
    filterLogEntries(base, { level: 'debug', query: '' }).map((e) => e.id),
    ['4'],
  );
}

function testFilterNoLevelMatches(): void {
  const entries: LogEntry[] = [
    { id: '1', timestamp: 100, level: 'info', source: 'w1', message: 'hello' },
  ];
  assert.deepEqual(
    filterLogEntries(entries, { level: 'error', query: '' }),
    [],
    'no entries at error level',
  );
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testCompareSameTimestamp();
testCompareAscending();
testCompareLargeTimestamps();
testSortStability();

testFilterAllLevelsNoQuery();
testFilterByLevel();
testFilterByQuery();
testFilterCaseInsensitive();
testFilterCombinedLevelAndQuery();
testFilterNoMatch();
testFilterEmptyArray();
testFilterQueryTrimsWhitespace();
testFilterQueryMatchesSource();
testFilterDebugLevel();
testFilterNoLevelMatches();

console.log('log-viewer-utils.test.ts: all assertions passed');
