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

  // Clicking a different column switches to it (descending by default).
  assert.deepEqual(getNextSortState(active, 'duration'), {
    field: 'duration',
    order: 'desc',
  });
  // Clicking the active column toggles direction.
  assert.deepEqual(getNextSortState(active, 'id'), { field: 'id', order: 'asc' });
  assert.deepEqual(getNextSortState({ field: 'id', order: 'asc' }, 'id'), {
    field: 'id',
    order: 'desc',
  });

  console.log('run-history-sort-utils: all assertions passed');
};

runAssertions();
