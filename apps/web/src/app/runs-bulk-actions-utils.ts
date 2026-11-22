/**
 * Bulk action toolbar utilities for multi-run selection.
 *
 * Issue: #855 - Add bulk action toolbar for selecting multiple runs
 */

import type { FuzzingRun, RunStatus } from './types';
import { RUN_STATUSES, isTerminalStatus } from '../lib/run-status';

export type BulkActionType = 'cancel' | 'retry' | 'delete' | 'export' | 'tag' | 'assign';

export interface BulkTagPayload {
  tags: string[];
}

export interface BulkAssignPayload {
  assignee: string;
}

export interface BulkUndoSnapshot {
  runs: FuzzingRun[];
  selectedRunIds: string[];
  takenAt: string;
}

const RETRYABLE_STATUSES: RunStatus[] = ['failed', 'cancelled'];
/** Any run that has stopped changing state can be deleted. */
const DELETABLE_STATUSES: RunStatus[] = RUN_STATUSES.filter(isTerminalStatus);

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
 * Range-select helper for shift-click (#1667). Returns the inclusive slice of
 * orderedIds between anchorId and focusId (either direction).
 */
export function selectRange(
  orderedIds: string[],
  anchorId: string | null,
  focusId: string,
): string[] {
  if (!anchorId) return [focusId];
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(focusId);
  if (from === -1 || to === -1) return [focusId];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return orderedIds.slice(lo, hi + 1);
}

/**
 * Select-all-in-lane helper (#1667). Adds every lane id to the selection;
 * clears just the lane when it is already fully selected.
 */
export function selectAllInLane(
  selectedRunIds: Set<string>,
  laneRunIds: string[],
): Set<string> {
  const allSelected =
    laneRunIds.length > 0 && laneRunIds.every((id) => selectedRunIds.has(id));
  const next = new Set(selectedRunIds);
  if (allSelected) {
    for (const id of laneRunIds) next.delete(id);
  } else {
    for (const id of laneRunIds) next.add(id);
  }
  return next;
}

/**
 * Snapshot runs + selection for undo toast rollback.
 */
export function createUndoSnapshot(
  runs: FuzzingRun[],
  selectedRunIds: Set<string>,
): BulkUndoSnapshot {
  return { runs: runs.map((r) => ({ ...r })), selectedRunIds: [...selectedRunIds], takenAt: new Date().toISOString() };
}

export function restoreUndoSnapshot(snapshot: BulkUndoSnapshot): { runs: FuzzingRun[]; selectedRunIds: Set<string> } {
  return { runs: snapshot.runs.map((r) => ({ ...r })), selectedRunIds: new Set(snapshot.selectedRunIds) };
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
  data?: BulkTagPayload | BulkAssignPayload | Record<string, unknown>,
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
    case 'tag': {
      const raw = (data as BulkTagPayload | Record<string, unknown> | undefined);
      const tags = Array.isArray((raw as BulkTagPayload)?.tags)
        ? (raw as BulkTagPayload).tags
        : typeof (raw as Record<string, unknown> | undefined)?.tags === 'string'
          ? String((raw as Record<string, unknown>).tags).split(',').map((t) => t.trim()).filter(Boolean)
          : [];
      if (tags.length === 0) return runs;
      return runs.map((run) =>
        runIds.includes(run.id)
          ? { ...run, tags: [...new Set([...(run.tags ?? []), ...tags])] }
          : run,
      );
    }
    case 'assign': {
      const assignee =
        typeof (data as BulkAssignPayload | undefined)?.assignee === 'string'
          ? (data as BulkAssignPayload).assignee
          : typeof (data as Record<string, unknown> | undefined)?.assignee === 'string'
            ? String((data as Record<string, unknown>).assignee)
            : '';
      if (!assignee) return runs;
      return runs.map((run) =>
        runIds.includes(run.id) ? { ...run, annotations: [...(run.annotations ?? []), `assigned:${assignee}`] } : run,
      );
    }
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
