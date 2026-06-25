import * as assert from 'node:assert/strict';
import {
  logEntryAnchorId,
  logEntryAnchorHref,
  getVisibleEntries,
  type LogPageState,
} from './log-viewer-page-utils';
import type { LogEntry } from '../log-viewer-utils';

// ---------------------------------------------------------------------------
// logEntryAnchorId / logEntryAnchorHref
// ---------------------------------------------------------------------------

function testAnchorId(): void {
  const entry: LogEntry = {
    id: 'abc-123',
    timestamp: 1000,
    level: 'info',
    source: 'fuzz-worker',
    message: 'campaign started',
  };
  assert.equal(logEntryAnchorId(entry), 'log-abc-123');
}

function testAnchorHref(): void {
  const entry: LogEntry = {
    id: 'abc-123',
    timestamp: 1000,
    level: 'info',
    source: 'fuzz-worker',
    message: 'campaign started',
  };
  assert.equal(logEntryAnchorHref(entry), '#log-abc-123');
}

function testAnchorIdSpecialChars(): void {
  const entry: LogEntry = {
    id: 'entry/42!',
    timestamp: 500,
    level: 'error',
    source: 'test',
    message: 'special',
  };
  assert.equal(logEntryAnchorId(entry), 'log-entry/42!');
  assert.equal(logEntryAnchorHref(entry), '#log-entry/42!');
}

function testAnchorIdEmptyString(): void {
  const entry: LogEntry = {
    id: '',
    timestamp: 0,
    level: 'info',
    source: 's',
    message: 'm',
  };
  assert.equal(logEntryAnchorId(entry), 'log-');
  assert.equal(logEntryAnchorHref(entry), '#log-');
}

// ---------------------------------------------------------------------------
// getVisibleEntries
// ---------------------------------------------------------------------------

const entries: LogEntry[] = [
  { id: '1', timestamp: 300, level: 'error', source: 'rpc',         message: 'timeout' },
  { id: '2', timestamp: 100, level: 'info',  source: 'scheduler',   message: 'started' },
  { id: '3', timestamp: 200, level: 'warn',  source: 'fuzz-worker', message: 'budget warning' },
];

function testGetVisibleLoadingState(): void {
  const loadingState: LogPageState = { dataState: 'loading', entries, levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(getVisibleEntries(loadingState), []);
}

function testGetVisibleErrorState(): void {
  const errorState: LogPageState = { dataState: 'error', entries, levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(getVisibleEntries(errorState), []);
}

function testGetVisibleSuccessNoFilter(): void {
  const successState: LogPageState = { dataState: 'success', entries, levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(
    getVisibleEntries(successState).map((e) => e.id),
    ['2', '3', '1'],
  );
}

function testGetVisibleLevelFilter(): void {
  const warnState: LogPageState = { dataState: 'success', entries, levelFilter: 'warn', searchQuery: '' };
  assert.deepEqual(
    getVisibleEntries(warnState).map((e) => e.id),
    ['3'],
  );
}

function testGetVisibleNoMatch(): void {
  const noMatchState: LogPageState = { dataState: 'success', entries, levelFilter: 'all', searchQuery: 'xyzzy' };
  assert.deepEqual(getVisibleEntries(noMatchState), []);
}

function testGetVisibleEmptyEntries(): void {
  const state: LogPageState = { dataState: 'success', entries: [], levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(getVisibleEntries(state), []);
}

function testGetVisibleAlreadySortedInput(): void {
  const sortedEntries: LogEntry[] = [
    { id: '1', timestamp: 100, level: 'info', source: 's', message: 'm1' },
    { id: '2', timestamp: 200, level: 'warn', source: 's', message: 'm2' },
  ];
  const state: LogPageState = { dataState: 'success', entries: sortedEntries, levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(
    getVisibleEntries(state).map((e) => e.id),
    ['1', '2'],
  );
}

function testGetVisibleReverseSortedInput(): void {
  const reversed: LogEntry[] = [
    { id: '3', timestamp: 300, level: 'info', source: 's', message: 'm3' },
    { id: '1', timestamp: 100, level: 'info', source: 's', message: 'm1' },
    { id: '2', timestamp: 200, level: 'info', source: 's', message: 'm2' },
  ];
  const state: LogPageState = { dataState: 'success', entries: reversed, levelFilter: 'all', searchQuery: '' };
  assert.deepEqual(
    getVisibleEntries(state).map((e) => e.id),
    ['1', '2', '3'],
  );
}

function testGetVisibleCombinedFilterAndQuery(): void {
  const state: LogPageState = { dataState: 'success', entries, levelFilter: 'error', searchQuery: 'timeout' };
  assert.deepEqual(
    getVisibleEntries(state).map((e) => e.id),
    ['1'],
  );
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testAnchorId();
testAnchorHref();
testAnchorIdSpecialChars();
testAnchorIdEmptyString();

testGetVisibleLoadingState();
testGetVisibleErrorState();
testGetVisibleSuccessNoFilter();
testGetVisibleLevelFilter();
testGetVisibleNoMatch();
testGetVisibleEmptyEntries();
testGetVisibleAlreadySortedInput();
testGetVisibleReverseSortedInput();
testGetVisibleCombinedFilterAndQuery();

console.log('log-viewer-page-utils.test.ts: all assertions passed');
