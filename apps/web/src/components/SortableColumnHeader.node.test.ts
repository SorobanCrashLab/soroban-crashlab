import * as assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SortableColumnHeader } from './SortableColumnHeader';
import { getNextSortState, getSortIndicator } from '../app/run-history-sort-utils';

function testSortableColumnHeaderHtml() {
  // Test 1: Neutral / Unsorted state
  const html1 = renderToStaticMarkup(
    React.createElement(SortableColumnHeader, {
      field: 'id',
      label: 'Run ID',
      sortState: null,
    })
  );

  assert(html1.includes('<th scope="col" aria-sort="none"'), 'th must have scope="col" and aria-sort="none"');
  assert(html1.includes('<button type="button"'), 'header must contain a real <button type="button"> element');
  assert(html1.includes('focus-visible:ring-2'), 'button must have visible focus-ring classes');
  assert(html1.includes('focus-visible:ring-blue-500'), 'button must have blue focus-ring');
  assert(html1.includes('↕'), 'neutral state must display ↕ glyph');
  assert(html1.includes('aria-label="Run ID, none. Activate to sort ascending"'), 'accessible name must include state and next action');

  // Test 2: Ascending state
  const html2 = renderToStaticMarkup(
    React.createElement(SortableColumnHeader, {
      field: 'id',
      label: 'Run ID',
      sortState: { field: 'id', order: 'asc' },
    })
  );

  assert(html2.includes('aria-sort="ascending"'), 'th must have aria-sort="ascending"');
  assert(html2.includes('↑'), 'ascending state must display ↑ glyph');
  assert(html2.includes('aria-label="Run ID, ascending. Activate to sort descending"'), 'accessible name must indicate ascending');

  // Test 3: Descending state
  const html3 = renderToStaticMarkup(
    React.createElement(SortableColumnHeader, {
      field: 'id',
      label: 'Run ID',
      sortState: { field: 'id', order: 'desc' },
    })
  );

  assert(html3.includes('aria-sort="descending"'), 'th must have aria-sort="descending"');
  assert(html3.includes('↓'), 'descending state must display ↓ glyph');
  assert(html3.includes('aria-label="Run ID, descending. Activate to remove sorting"'), 'accessible name must indicate descending');

  // Test 4: Inactive column when another is active
  const html4 = renderToStaticMarkup(
    React.createElement(SortableColumnHeader, {
      field: 'duration',
      label: 'Duration',
      align: 'right',
      sortState: { field: 'id', order: 'desc' },
    })
  );

  assert(html4.includes('aria-sort="none"'), 'inactive column th must have aria-sort="none"');
  assert(html4.includes('↕'), 'inactive column must display neutral ↕ glyph');
  assert(html4.includes('justify-end'), 'right-aligned column must include justify-end');

  // Test 5: State machine toggle transitions
  let current = { field: 'id', order: 'none' as const };
  current = getNextSortState(current, 'id');
  assert.equal(current.order, 'asc');
  assert.equal(getSortIndicator('id', current).ariaSort, 'ascending');

  current = getNextSortState(current, 'id');
  assert.equal(current.order, 'desc');
  assert.equal(getSortIndicator('id', current).ariaSort, 'descending');

  current = getNextSortState(current, 'id');
  assert.equal(current.order, 'none');
  assert.equal(getSortIndicator('id', current).ariaSort, 'none');

  console.log('SortableColumnHeader.node.test.ts: all assertions passed');
}

testSortableColumnHeaderHtml();
