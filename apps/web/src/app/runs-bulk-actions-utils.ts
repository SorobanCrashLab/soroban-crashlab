/**
 * Bulk action toolbar utilities for multi-run selection.
 *
 * Issue: #855 - Add bulk action toolbar for selecting multiple runs
 */

import type { FuzzingRun, RunStatus } from './types';

export type BulkActionType = 'cancel' | 'retry' | 'delete' | 'export' | 'tag' | 'assign';

const RETRYABLE_STATUSES: RunStatus[] = ['failed', 'cancelled'];
const DELETABLE_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

/**
 * Toggles a single run ID in the current selection set.
 */
export function toggleRunSelection(
  selectedRunIds: Set<string>,
  runId: string,
): Set<string> {
  const next = new Set(selectedRunIds);
  if (next.has(runId)) {
    next.delete(runId);
  } else {
    next.add(runId);
  }
  return next;
}

/**
 * Toggles selection for all runs on the current page.
 * Clears selection when every visible run is already selected.
 */
export function toggleAllRunSelection(
  selectedRunIds: Set<string>,
  visibleRunIds: string[],
): Set<string> {
  const allSelected =
    visibleRunIds.length > 0 &&
    visibleRunIds.every((id) => selectedRunIds.has(id));

  if (allSelected) {
    return new Set();
  }
  return new Set(visibleRunIds);
}

/**
 * Returns runs that match the current selection.
 */
export function getSelectedRuns(
  runs: FuzzingRun[],
  selectedRunIds: Set<string>,
): FuzzingRun[] {
  return runs.filter((run) => selectedRunIds.has(run.id));
}

/**
 * Determines whether a bulk action can be performed on the selected runs.
 */
export function canPerformBulkAction(
  action: BulkActionType,
  selectedRuns: FuzzingRun[],
): boolean {
  if (selectedRuns.length === 0) {
    return false;
  }

  switch (action) {
    case 'cancel':
      return selectedRuns.some((run) => run.status === 'running');
    case 'retry':
      return selectedRuns.some((run) => RETRYABLE_STATUSES.includes(run.status));
    case 'delete':
      return selectedRuns.some((run) => DELETABLE_STATUSES.includes(run.status));
    case 'export':
    case 'tag':
    case 'assign':
      return true;
    default:
      return false;
  }
}

/**
 * Applies a bulk action to the run list and returns the updated runs.
 * Export actions leave the list unchanged.
 */
export function applyBulkActionToRuns(
  runs: FuzzingRun[],
  action: BulkActionType,
  runIds: string[],
): FuzzingRun[] {
  switch (action) {
    case 'delete':
      return runs.filter((run) => !runIds.includes(run.id));
    case 'cancel':
      return runs.map((run) =>
        runIds.includes(run.id) ? { ...run, status: 'cancelled' } : run,
      );
    case 'retry':
      return runs.map((run) =>
        runIds.includes(run.id) ? { ...run, status: 'running' } : run,
      );
    default:
      return runs;
  }
}

/**
 * Whether the bulk action toolbar should remain visible after an action.
 */
export function shouldClearSelectionAfterAction(action: BulkActionType): boolean {
  return action !== 'export';
}

/**
 * Returns a short description for each bulk action.
 */
export function getBulkActionDescription(action: BulkActionType): string {
  switch (action) {
    case 'cancel':
      return 'Cancel running runs';
    case 'retry':
      return 'Retry failed or cancelled runs';
    case 'delete':
      return 'Delete completed runs';
    case 'export':
      return 'Export selected runs data';
    case 'tag':
      return 'Add tags to selected runs';
    case 'assign':
      return 'Assign runs to team members';
    default:
      return '';
  }
}
