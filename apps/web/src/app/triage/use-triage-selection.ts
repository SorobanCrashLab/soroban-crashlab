'use client';

/**
 * app/triage/use-triage-selection — shared multi-select + undo (#1667).
 * Click toggles, shift-click range-selects, select-all-in-lane per column.
 * Optimistic updates with rollback; reason surfaced via toUserMessage.
 */
import { useCallback, useState } from 'react';
import type { FuzzingRun } from '../types';
import {
  applyBulkActionToRuns,
  createUndoSnapshot,
  restoreUndoSnapshot,
  selectAllInLane,
  selectRange,
  type BulkActionType,
  type BulkUndoSnapshot,
} from '../runs-bulk-actions-utils';
import { toUserMessage } from '../../lib/api-error-mapper';

export function useTriageSelection(orderedIds: string[]) {
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<BulkUndoSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleOne = useCallback(
    (id: string, withRange: boolean) => {
      setSelectedRunIds((prev) => {
        if (withRange && anchorId) {
          const next = new Set(prev);
          for (const rid of selectRange(orderedIds, anchorId, id)) next.add(rid);
          return next;
        }
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchorId(id);
    },
    [anchorId, orderedIds],
  );

  const selectLane = useCallback((laneIds: string[]) => {
    setSelectedRunIds((prev) => selectAllInLane(prev, laneIds));
  }, []);

  const clearSelection = useCallback(() => setSelectedRunIds(new Set()), []);

  const applyOptimistic = useCallback(
    (runs: FuzzingRun[], action: BulkActionType, ids: string[], data?: Record<string, unknown>) => {
      setUndoSnapshot(createUndoSnapshot(runs, selectedRunIds));
      try {
        return applyBulkActionToRuns(runs, action, ids, data);
      } catch (err) {
        setNotice(toUserMessage(err, 'Bulk action failed.'));
        return runs;
      }
    },
    [selectedRunIds],
  );

  const undo = useCallback(() => {
    if (!undoSnapshot) return null;
    const restored = restoreUndoSnapshot(undoSnapshot);
    setSelectedRunIds(restored.selectedRunIds);
    setUndoSnapshot(null);
    return restored.runs;
  }, [undoSnapshot]);

  return { selectedRunIds, anchorId, notice, undoSnapshot, toggleOne, selectLane, clearSelection, applyOptimistic, undo, setNotice };
}
