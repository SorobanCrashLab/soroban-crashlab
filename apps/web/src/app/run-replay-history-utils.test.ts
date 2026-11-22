import * as assert from 'node:assert/strict';
import {
  appendReplayHistoryEntry,
  createReplayHistoryEntry,
  filterReplayHistoryBySourceRun,
  formatReplayDuration,
  formatReplayHistoryRelativeTimestamp,
  formatReplayHistoryTimestamp,
  isIsoDateString,
  parseReplayHistoryEntry,
  readReplayHistory,
  serializeReplayHistory,
  sortReplayHistoryByTimestamp,
} from './run-replay-history-utils';

const startedAt = '2026-06-24T10:00:00.000Z';
const completedAt = '2026-06-24T10:00:05.500Z';

function makeEntry(overrides: Partial<ReturnType<typeof createReplayHistoryEntry>> = {}) {
  return createReplayHistoryEntry({
    id: 'history-1',
    sourceRunId: 'run-1001',
    replayRunId: 'replay-run-1001-abc',
    startedAt,
    completedAt,
    status: 'completed',
    seedsReplayed: 10,
    seedsFailed: 1,
    ...overrides,
  });
}

function testIsoValidation() {
  assert.equal(isIsoDateString(startedAt), true);
  assert.equal(isIsoDateString('not-a-date'), false);
}

function testCreateReplayHistoryEntry() {
  const entry = makeEntry();
  assert.equal(entry.durationMs, 5500);
  assert.equal(entry.seedsReplayed, 10);
  assert.equal(entry.seedsFailed, 1);
}

function testParseReplayHistoryEntry() {
  const parsed = parseReplayHistoryEntry(makeEntry());
  assert.ok(parsed);
  assert.equal(parsed?.replayRunId, 'replay-run-1001-abc');

  assert.equal(parseReplayHistoryEntry({ id: 'bad' }), null);
  assert.equal(parseReplayHistoryEntry(null), null);
}

function testReadAndSerializeReplayHistory() {
  const entries = [makeEntry(), makeEntry({ id: 'history-2', sourceRunId: 'run-1002' })];
  const serialized = serializeReplayHistory(entries);
  const restored = readReplayHistory(serialized);

  assert.equal(restored.length, 2);
  assert.equal(restored[0]?.id, 'history-1');
  assert.deepEqual(readReplayHistory(null), []);
  assert.deepEqual(readReplayHistory('{ invalid json'), []);
}

function testAppendReplayHistoryEntry() {
  const first = makeEntry({ id: 'history-1', completedAt: '2026-06-24T09:00:00.000Z' });
  const second = makeEntry({ id: 'history-2', completedAt: '2026-06-24T11:00:00.000Z' });
  const appended = appendReplayHistoryEntry([first], second, 10);

  assert.equal(appended.length, 2);
  assert.equal(appended[0]?.id, 'history-2');
}

function testSortReplayHistoryByTimestamp() {
  const older = makeEntry({ id: 'older', completedAt: '2026-06-24T08:00:00.000Z' });
  const newer = makeEntry({ id: 'newer', completedAt: '2026-06-24T12:00:00.000Z' });
  const sorted = sortReplayHistoryByTimestamp([older, newer], 'desc');

  assert.equal(sorted[0]?.id, 'newer');
  assert.equal(sortReplayHistoryByTimestamp([older, newer], 'asc')[0]?.id, 'older');
}

function testFilterReplayHistoryBySourceRun() {
  const entries = [
    makeEntry({ id: 'a', sourceRunId: 'run-1001' }),
    makeEntry({ id: 'b', sourceRunId: 'run-1002' }),
  ];

  assert.equal(filterReplayHistoryBySourceRun(entries, 'run-1001').length, 1);
  assert.equal(filterReplayHistoryBySourceRun(entries, '').length, 2);
}

function testFormattingHelpers() {
  assert.match(formatReplayHistoryTimestamp(startedAt), /2026/);
  assert.equal(formatReplayHistoryTimestamp('invalid'), 'invalid');
  assert.equal(formatReplayDuration(850), '850ms');
  assert.equal(formatReplayDuration(2500), '2.5s');

  const now = new Date('2026-06-24T10:00:30.000Z');
  assert.equal(
    formatReplayHistoryRelativeTimestamp('2026-06-24T10:00:10.000Z', now),
    'Just now',
  );
  assert.equal(
    formatReplayHistoryRelativeTimestamp('2026-06-24T09:30:00.000Z', now),
    '30m ago',
  );
}

function runAssertions() {
  testIsoValidation();
  testCreateReplayHistoryEntry();
  testParseReplayHistoryEntry();
  testReadAndSerializeReplayHistory();
  testAppendReplayHistoryEntry();
  testSortReplayHistoryByTimestamp();
  testFilterReplayHistoryBySourceRun();
  testFormattingHelpers();
}

runAssertions();
console.log('run-replay-history-utils.test.ts: all assertions passed');
