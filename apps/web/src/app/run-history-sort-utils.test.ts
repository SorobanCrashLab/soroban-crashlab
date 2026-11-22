import * as assert from 'node:assert/strict';
import {
  getSortIndicator,
  getNextSortState,
  type SortState,
} from './run-history-sort-utils';

const runAssertions = () => {
  const active: SortState = { field: 'id', order: 'desc' };

  // #838: the active column reflects its direction...
  assert.deepEqual(getSortIndicator('id', active), {
    active: true,
    symbol: '↓',
    ariaSort: 'descending',
  });
  assert.deepEqual(getSortIndicator('id', { field: 'id', order: 'asc' }), {
    active: true,
    symbol: '↑',
    ariaSort: 'ascending',
  });

  // ...while inactive sortable columns get a neutral indicator, not a stale arrow.
  assert.deepEqual(getSortIndicator('duration', active), {
    active: false,
    symbol: '↕',
    ariaSort: 'none',
  });

  // None/un-sorted state gets neutral indicator.
  assert.deepEqual(getSortIndicator('id', { field: null, order: 'none' }), {
    active: false,
    symbol: '↕',
    ariaSort: 'none',
  });
  assert.deepEqual(getSortIndicator('id', { field: 'id', order: 'none' }), {
    active: false,
    symbol: '↕',
    ariaSort: 'none',
  });
  assert.deepEqual(getSortIndicator('id', null), {
    active: false,
    symbol: '↕',
    ariaSort: 'none',
  });

  // Switching to a different column starts at 'asc'
  assert.deepEqual(getNextSortState(active, 'duration'), {
    field: 'duration',
    order: 'asc',
  });

  // Toggle-cycle semantics: asc → desc → none → asc
  // 1. none/initial -> asc
  assert.deepEqual(getNextSortState(null, 'id'), {
    field: 'id',
    order: 'asc',
  });
  assert.deepEqual(getNextSortState({ field: null, order: 'none' }, 'id'), {
    field: 'id',
    order: 'asc',
  });
  // 2. asc -> desc
  assert.deepEqual(getNextSortState({ field: 'id', order: 'asc' }, 'id'), {
    field: 'id',
    order: 'desc',
  });
  // 3. desc -> none
  assert.deepEqual(getNextSortState({ field: 'id', order: 'desc' }, 'id'), {
    field: null,
    order: 'none',
  });
  // 4. none -> asc (restart cycle)
  assert.deepEqual(getNextSortState({ field: 'id', order: 'none' }, 'id'), {
    field: 'id',
    order: 'asc',
  });

  console.log('run-history-sort-utils: all assertions passed');
};

runAssertions();

