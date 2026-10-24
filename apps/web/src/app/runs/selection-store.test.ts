import * as assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  applyFilterContext,
  clearRunSelection,
  createRunSelectionState,
  getSelectAllLabel,
  getSelectionAnnouncement,
  getSelectionCount,
  isRunSelected,
  pruneRunSelection,
  selectAllLoaded,
  selectAllMatching,
  toggleRunSelection,
} from './selection-store';

function testEmptyState(): void {
  const state = createRunSelectionState();
  assert.equal(state.mode, 'explicit');
  assert.equal(getSelectionCount(state), 0);
  assert.equal(isRunSelected(state, 'run-1'), false);
  assert.equal(getSelectionAnnouncement(state), '');
}

function testExplicitToggling(): void {
  let state = createRunSelectionState();
  state = toggleRunSelection(state, 'run-1');
  state = toggleRunSelection(state, 'run-2');
  assert.equal(getSelectionCount(state), 2);
  assert.equal(isRunSelected(state, 'run-1'), true);

  state = toggleRunSelection(state, 'run-1');
  assert.equal(getSelectionCount(state), 1);
  assert.equal(isRunSelected(state, 'run-1'), false);
  assert.equal(isRunSelected(state, 'run-2'), true);

  assert.equal(getSelectionAnnouncement(state), '1 run selected');
}

function testSelectionSurvivesPageAppends(): void {
  // Simulates cursor pagination: select on page 1, then page 2 arrives.
  let state = selectAllLoaded(createRunSelectionState(), ['run-1', 'run-2']);
  state = toggleRunSelection(state, 'run-3'); // loaded on page 2
  assert.equal(getSelectionCount(state), 3);

  // Re-rendering with a different loaded window must not lose ids.
  state = pruneRunSelection(state, ['run-1', 'run-2', 'run-3', 'run-4']);
  assert.equal(getSelectionCount(state), 3);
}

function testPruneDropsDeletedRuns(): void {
  let state = selectAllLoaded(createRunSelectionState(), ['run-1', 'run-2', 'run-3']);
  state = pruneRunSelection(state, ['run-1', 'run-3']);
  assert.deepEqual(state.ids, ['run-1', 'run-3']);
}

function testQueryBasedSelectAll(): void {
  let state = selectAllMatching(createRunSelectionState(), {
    queryKey: 'status=failed',
    matchingCount: 125_000,
  });
  assert.equal(state.mode, 'all-matching');
  assert.equal(getSelectionCount(state), 125_000);
  assert.equal(isRunSelected(state, 'run-not-loaded-yet'), true);
  assert.equal(
    getSelectionAnnouncement(state),
    '125,000 runs selected, all runs matching the current filters',
  );

  // De-selecting a single run expresses an exclusion, not an explicit list.
  state = toggleRunSelection(state, 'run-42');
  assert.equal(isRunSelected(state, 'run-42'), false);
  assert.equal(isRunSelected(state, 'run-43'), true);
  assert.equal(getSelectionCount(state), 124_999);

  // Re-selecting removes the exclusion.
  state = toggleRunSelection(state, 'run-42');
  assert.equal(isRunSelected(state, 'run-42'), true);
  assert.equal(getSelectionCount(state), 125_000);
}

function testFilterChangeResetsQuerySelection(): void {
  let state = selectAllMatching(createRunSelectionState(), {
    queryKey: 'status=failed',
    matchingCount: 10,
  });

  // Same filters: only the count is refreshed.
  const sameFilters = applyFilterContext(state, 'status=failed', 12);
  assert.equal(getSelectionCount(sameFilters), 12);

  // Different filters: query selection is no longer meaningful.
  const changedFilters = applyFilterContext(state, 'status=completed', 30);
  assert.equal(changedFilters.mode, 'explicit');
  assert.equal(getSelectionCount(changedFilters), 0);

  // Explicit selections are left alone by filter changes.
  state = selectAllLoaded(createRunSelectionState(), ['run-1']);
  assert.equal(getSelectionCount(applyFilterContext(state, 'status=completed')), 1);
}

function testClear(): void {
  let state = selectAllMatching(createRunSelectionState(), {
    queryKey: 'q',
    matchingCount: 5,
  });
  state = clearRunSelection(state);
  assert.equal(state.mode, 'explicit');
  assert.equal(getSelectionCount(state), 0);
}

function testSelectAllLabels(): void {
  const state = createRunSelectionState();
  assert.equal(getSelectAllLabel(state, 100, 100), 'Select all 100 runs');
  assert.equal(
    getSelectAllLabel(state, 100, 100_000),
    'Select all 100,000 runs matching the current filters',
  );
}

describe('runs selection store', () => {
  it('starts empty', testEmptyState);
  it('toggles explicit selection', testExplicitToggling);
  it('survives page appends', testSelectionSurvivesPageAppends);
  it('prunes deleted runs', testPruneDropsDeletedRuns);
  it('supports query-based select-all', testQueryBasedSelectAll);
  it('invalidates query selection when filters change', testFilterChangeResetsQuerySelection);
  it('clears', testClear);
  it('describes select-all labels', testSelectAllLabels);
});
