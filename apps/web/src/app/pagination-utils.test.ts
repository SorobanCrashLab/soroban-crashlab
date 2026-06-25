import * as assert from 'node:assert/strict';
import {
  buildPaginationState,
  clampPage,
  computeTotalPages,
  getPageSlice,
} from './pagination-utils';

// computeTotalPages
assert.equal(computeTotalPages(0, 10), 1);       // empty list → at least 1 page
assert.equal(computeTotalPages(10, 10), 1);
assert.equal(computeTotalPages(11, 10), 2);
assert.equal(computeTotalPages(20, 10), 2);
assert.equal(computeTotalPages(21, 10), 3);
assert.equal(computeTotalPages(1, 1), 1);
assert.equal(computeTotalPages(100, 7), 15);      // ceil(100/7)=15

assert.throws(() => computeTotalPages(10, 0), RangeError);
assert.throws(() => computeTotalPages(10, -1), RangeError);

// clampPage
assert.equal(clampPage(1, 5), 1);
assert.equal(clampPage(5, 5), 5);
assert.equal(clampPage(0, 5), 1);   // below min → 1
assert.equal(clampPage(-3, 5), 1);
assert.equal(clampPage(6, 5), 5);   // above max → totalPages
assert.equal(clampPage(99, 1), 1);

// getPageSlice
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
assert.deepEqual(getPageSlice(items, 1, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(getPageSlice(items, 2, 10), [11]);         // last partial page
assert.deepEqual(getPageSlice(items, 3, 10), []);           // beyond end → empty
assert.deepEqual(getPageSlice([], 1, 10), []);
assert.deepEqual(getPageSlice(items, 1, 5), [1, 2, 3, 4, 5]);
assert.deepEqual(getPageSlice(items, 2, 5), [6, 7, 8, 9, 10]);

assert.throws(() => getPageSlice(items, 1, 0), RangeError);

// buildPaginationState
const state = buildPaginationState(25, 3, 10);
assert.equal(state.totalItems, 25);
assert.equal(state.pageSize, 10);
assert.equal(state.totalPages, 3);
assert.equal(state.currentPage, 3);

// clamps out-of-bounds page
assert.equal(buildPaginationState(25, 99, 10).currentPage, 3);
assert.equal(buildPaginationState(25, 0, 10).currentPage, 1);

// empty list always produces page 1 of 1
const empty = buildPaginationState(0, 1, 10);
assert.equal(empty.totalPages, 1);
assert.equal(empty.currentPage, 1);

console.log('pagination-utils.test.ts: all assertions passed');
