import * as assert from 'node:assert/strict';
import {
  logEntryAnchorId,
  logEntryAnchorHref,
  getVisibleEntries,
  type LogPageState,
} from './log-viewer-page-utils';
import type { LogEntry } from '../log-viewer-utils';

const entry: LogEntry = {
  id: 'abc-123',
  timestamp: 1000,
  level: 'info',
  source: 'fuzz-worker',
  message: 'campaign started',
};

const entries: LogEntry[] = [
  { id: '1', timestamp: 300, level: 'error', source: 'rpc',         message: 'timeout' },
  { id: '2', timestamp: 100, level: 'info',  source: 'scheduler',   message: 'started' },
  { id: '3', timestamp: 200, level: 'warn',  source: 'fuzz-worker', message: 'budget warning' },
];

// anchor helpers
assert.equal(logEntryAnchorId(entry), 'log-abc-123');
assert.equal(logEntryAnchorHref(entry), '#log-abc-123');

// getVisibleEntries – loading state returns empty
const loadingState: LogPageState = { dataState: 'loading', entries, levelFilter: 'all', searchQuery: '' };
assert.deepEqual(getVisibleEntries(loadingState), []);

// getVisibleEntries – error state returns empty
const errorState: LogPageState = { dataState: 'error', entries, levelFilter: 'all', searchQuery: '' };
assert.deepEqual(getVisibleEntries(errorState), []);

// getVisibleEntries – success, no filter, sorted by timestamp
const successState: LogPageState = { dataState: 'success', entries, levelFilter: 'all', searchQuery: '' };
assert.deepEqual(
  getVisibleEntries(successState).map((e) => e.id),
  ['2', '3', '1'],
);

// getVisibleEntries – level filter
const warnState: LogPageState = { dataState: 'success', entries, levelFilter: 'warn', searchQuery: '' };
assert.deepEqual(
  getVisibleEntries(warnState).map((e) => e.id),
  ['3'],
);

// getVisibleEntries – search query (edge case: no matches)
const noMatchState: LogPageState = { dataState: 'success', entries, levelFilter: 'all', searchQuery: 'xyzzy' };
assert.deepEqual(getVisibleEntries(noMatchState), []);

console.log('log-viewer-page-utils.test.ts: all assertions passed');
