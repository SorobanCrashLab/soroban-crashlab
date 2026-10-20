/**
 * Selection model for the virtualized runs table (#1875 / W5-H05).
 *
 * Selection is keyed by run **id**, not by row index, so it survives
 * virtualization, sorting, filtering and cursor pagination (rows are unmounted
 * and re-fetched constantly; indices are not stable, ids are).
 *
 * Two modes:
 * - `explicit`     — an explicit set of ids, toggled row by row or via
 *                    "select all loaded".
 * - `all-matching` — a query-based selection: "everything matching the current
 *                    filter", expressed as a count preview plus a set of ids the
 *                    user has explicitly de-selected. Newly loaded pages are
 *                    therefore automatically selected.
 *
 * Pure functions only: no React, no DOM.
 */

export type RunSelectionMode = 'explicit' | 'all-matching';

export interface RunSelectionState {
  mode: RunSelectionMode;
  /** Explicitly selected ids (`mode === 'explicit'`). */
  ids: string[];
  /** Explicitly de-selected ids (`mode === 'all-matching'`). */
  excludedIds: string[];
  /** Fingerprint of the filters the query-based selection was made against. */
  queryKey: string | null;
  /** Number of runs matching the current filter, as reported by the API. */
  matchingCount: number;
}

export function createRunSelectionState(): RunSelectionState {
  return {
    mode: 'explicit',
    ids: [],
    excludedIds: [],
    queryKey: null,
    matchingCount: 0,
  };
}

/** Whether a run id is currently selected under the active mode. */
export function isRunSelected(state: RunSelectionState, id: string): boolean {
  if (!id) return false;
  if (state.mode === 'all-matching') {
    return !state.excludedIds.includes(id);
  }
  return state.ids.includes(id);
}

/** Number of selected runs — the API count minus de-selections in query mode. */
export function getSelectionCount(state: RunSelectionState): number {
  if (state.mode === 'all-matching') {
    return Math.max(0, state.matchingCount - state.excludedIds.length);
  }
  return state.ids.length;
}

/**
 * Toggle a single run.
 * In `all-matching` mode the toggle is recorded as an exclusion, so the rest of
 * the (unspecified) result set stays selected.
 */
export function toggleRunSelection(state: RunSelectionState, id: string): RunSelectionState {
  if (!id) return state;

  if (state.mode === 'all-matching') {
    const excluded = state.excludedIds.includes(id)
      ? state.excludedIds.filter((existing) => existing !== id)
      : [...state.excludedIds, id];
    return { ...state, excludedIds: excluded };
  }

  const ids = state.ids.includes(id)
    ? state.ids.filter((existing) => existing !== id)
    : [...state.ids, id];
  return { ...state, ids };
}

/** Explicit selection of the rows currently loaded ("select all loaded"). */
export function selectAllLoaded(state: RunSelectionState, ids: string[]): RunSelectionState {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  return {
    ...state,
    mode: 'explicit',
    ids: unique,
    excludedIds: [],
  };
}

/**
 * Query-based "select all matching filter" with a count preview.
 * `queryKey` fingerprints the active filters so the selection can be invalidated
 * when those filters change.
 */
export function selectAllMatching(
  state: RunSelectionState,
  options: { queryKey: string; matchingCount: number },
): RunSelectionState {
  return {
    ...state,
    mode: 'all-matching',
    ids: [],
    excludedIds: [],
    queryKey: options.queryKey,
    matchingCount: Math.max(0, Math.trunc(options.matchingCount)),
  };
}

/** Clear every selected and excluded id, returning to explicit-empty. */
export function clearRunSelection(state: RunSelectionState = createRunSelectionState()): RunSelectionState {
  return {
    ...state,
    mode: 'explicit',
    ids: [],
    excludedIds: [],
    queryKey: null,
    matchingCount: 0,
  };
}

/**
 * Refresh the "matching" count for a query-based selection and invalidate the
 * selection when the filter fingerprint changed (a selection made against a
 * different filter is not meaningful).
 */
export function applyFilterContext(
  state: RunSelectionState,
  queryKey: string,
  matchingCount = state.matchingCount,
): RunSelectionState {
  if (state.mode !== 'all-matching') return state;
  if (state.queryKey === queryKey) {
    return matchingCount === state.matchingCount ? state : { ...state, matchingCount };
  }
  return clearRunSelection(state);
}

/** Drop selected ids that no longer exist (e.g. after a bulk delete). */
export function pruneRunSelection(state: RunSelectionState, knownIds: Iterable<string>): RunSelectionState {
  if (state.mode === 'all-matching') return state;
  const known = new Set(knownIds);
  const ids = state.ids.filter((id) => known.has(id));
  return ids.length === state.ids.length ? state : { ...state, ids };
}

/**
 * Accessible label for the select-all checkbox, including the count preview
 * required by the issue ("select all N matching").
 */
export function getSelectAllLabel(state: RunSelectionState, loadedCount: number, totalCount: number): string {
  if (totalCount > loadedCount) {
    return `Select all ${totalCount.toLocaleString('en-US')} runs matching the current filters`;
  }
  return `Select all ${loadedCount.toLocaleString('en-US')} runs`;
}

/** Live-region announcement for the current selection. */
export function getSelectionAnnouncement(state: RunSelectionState): string {
  const count = getSelectionCount(state);
  if (count === 0) return '';
  const noun = count === 1 ? 'run' : 'runs';
  if (state.mode === 'all-matching') {
    return `${count.toLocaleString('en-US')} ${noun} selected, all runs matching the current filters`;
  }
  return `${count.toLocaleString('en-US')} ${noun} selected`;
}
