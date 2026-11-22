"use client";

import { useCallback, useMemo, useState } from "react";
import type { FuzzingRun } from "@/app/types";
import {
  addRun,
  baselineSlot,
  candidateSlots,
  canAddSlot,
  createSlot,
  initialComparisonState,
  moveRun,
  pinBaseline,
  removeRun,
  setPanel,
  type ComparisonState,
} from "../comparisonState";
import type { ComparisonPanel } from "../types";

export interface UseComparisonResult {
  state: ComparisonState;
  selectedRuns: FuzzingRun[];
  baseline: FuzzingRun | null;
  candidates: FuzzingRun[];
  availableRuns: FuzzingRun[];
  canAdd: boolean;
  add: (runId: string) => void;
  remove: (slotId: string) => void;
  move: (slotId: string, direction: -1 | 1) => void;
  pin: (slotId: string) => void;
  selectPanel: (panel: ComparisonPanel) => void;
}

export function useComparison(runs: FuzzingRun[], initialRunIds?: string[]): UseComparisonResult {
  const [state, setState] = useState<ComparisonState>(() =>
    initialComparisonState(initialRunIds?.length ? initialRunIds : runs.slice(0, 2).map((run) => run.id)),
  );

  const byId = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const selectedRuns = useMemo(
    () => state.slots.map((slot) => byId.get(slot.runId)).filter((run): run is FuzzingRun => Boolean(run)),
    [state.slots, byId],
  );
  const baselineSlotValue = baselineSlot(state);
  const baseline = baselineSlotValue ? byId.get(baselineSlotValue.runId) ?? null : null;
  const candidates = useMemo(
    () =>
      candidateSlots(state)
        .map((slot) => byId.get(slot.runId))
        .filter((run): run is FuzzingRun => Boolean(run)),
    [state, byId],
  );

  const selectedIds = useMemo(() => new Set(state.slots.map((slot) => slot.runId)), [state.slots]);
  const availableRuns = useMemo(() => runs.filter((run) => !selectedIds.has(run.id)), [runs, selectedIds]);

  const add = useCallback((runId: string) => setState((current) => addRun(current, runId)), []);
  const remove = useCallback((slotId: string) => setState((current) => removeRun(current, slotId)), []);
  const move = useCallback(
    (slotId: string, direction: -1 | 1) => setState((current) => moveRun(current, slotId, direction)),
    [],
  );
  const pin = useCallback((slotId: string) => setState((current) => pinBaseline(current, slotId)), []);
  const selectPanel = useCallback((panel: ComparisonPanel) => setState((current) => setPanel(current, panel)), []);

  return {
    state,
    selectedRuns,
    baseline,
    candidates,
    availableRuns,
    canAdd: canAddSlot(state, runs),
    add,
    remove,
    move,
    pin,
    selectPanel,
  };
}

export { createSlot };
