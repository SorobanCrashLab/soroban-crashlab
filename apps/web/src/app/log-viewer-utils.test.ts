import * as assert from 'node:assert/strict';
import {
  compareLogEntriesByTime,
  filterLogEntries,
  type LogEntry,
} from './log-viewer-utils';

const base: LogEntry[] = [
  {
    id: '1',
    timestamp: 100,
    level: 'info',
    source: 'fuzz-worker',
    message: 'campaign started',
  },
  {
    id: '2',
    timestamp: 200,
    level: 'warn',
    source: 'rpc',
    message: 'rate limit approaching',
  },
  {
    id: '3',
    timestamp: 150,
    level: 'error',
    source: 'scheduler',
    message: 'seed replay failed',
  },
  {
    id: '4',
    timestamp: 250,
    level: 'debug',
    source: 'fuzz-worker',
    message: 'mutation batch 42',
  },
];

const runAssertions = (): void => {
  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: '' }).map((e) => e.id),
    ['1', '2', '3', '4'],
  );

  assert.deepEqual(
    filterLogEntries(base, { level: 'warn', query: '' }).map((e) => e.id),
    ['2'],
  );

  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: 'replay' }).map((e) => e.id),
    ['3'],
  );

  assert.deepEqual(
    filterLogEntries(base, { level: 'all', query: 'RPC' }).map((e) => e.id),
    ['2'],
  );

  assert.deepEqual(
    filterLogEntries(base, { level: 'error', query: 'seed' }).map((e) => e.id),
    ['3'],
  );

  assert.deepEqual(filterLogEntries(base, { level: 'info', query: 'rpc' }), []);

  const sorted = [...base].sort(compareLogEntriesByTime);
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['1', '3', '2', '4'],
  );
};

runAssertions();
console.log('log-viewer-utils.test.ts: all assertions passed');
