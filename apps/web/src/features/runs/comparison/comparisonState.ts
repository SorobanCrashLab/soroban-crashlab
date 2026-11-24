/** Pure state transitions for the comparison workbench. */

import type { FuzzingRun } from "@/app/types";
import type { ComparisonPanel, RunSlot } from "./types";

export const MIN_COMPARISON_RUNS = 2;
export const MAX_COMPARISON_RUNS = 5;

export interface ComparisonState {
  slots: RunSlot[];
  activePanel: ComparisonPanel;
}

let slotCounter = 0;

export function createSlot(runId: string, role: "baseline" | "candidate" = "candidate"): RunSlot {
  slotCounter += 1;
  return { id: `slot-${slotCounter}`, runId, role, pinned: role === "baseline" };
}

export function initialComparisonState(runIds: string[]): ComparisonState {
  const ids = runIds.filter((id, index) => runIds.indexOf(id) === index).slice(0, MAX_COMPARISON_RUNS);
  const slots = ids.map((id, index) => createSlot(id, index === 0 ? "baseline" : "candidate"));
  return { slots, activePanel: "metrics" };
}

export function canAddSlot(state: ComparisonState, availableRuns: FuzzingRun[]): boolean {
  if (state.slots.length >= MAX_COMPARISON_RUNS) return false;
  const selected = new Set(state.slots.map((slot) => slot.runId));
  return availableRuns.some((run) => !selected.has(run.id));
}

export function addRun(state: ComparisonState, runId: string): ComparisonState {
  if (state.slots.length >= MAX_COMPARISON_RUNS) return state;
  if (state.slots.some((slot) => slot.runId === runId)) return state;
  return { ...state, slots: [...state.slots, createSlot(runId)] };
}

export function removeRun(state: ComparisonState, slotId: string): ComparisonState {
  if (state.slots.length <= MIN_COMPARISON_RUNS) return state;
  const removed = state.slots.find((slot) => slot.id === slotId);
  const slots = state.slots.filter((slot) => slot.id !== slotId);
  if (removed?.role === "baseline" && slots.length > 0) {
    slots[0] = { ...slots[0], role: "baseline", pinned: true };
  }
  return { ...state, slots };
}

export function moveRun(state: ComparisonState, slotId: string, direction: -1 | 1): ComparisonState {
  const index = state.slots.findIndex((slot) => slot.id === slotId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.slots.length) return state;
  const slots = [...state.slots];
  [slots[index], slots[target]] = [slots[target], slots[index]];
  return { ...state, slots };
}

export function pinBaseline(state: ComparisonState, slotId: string): ComparisonState {
  if (!state.slots.some((slot) => slot.id === slotId)) return state;
  return {
    ...state,
    slots: state.slots.map((slot) => ({
      ...slot,
      role: slot.id === slotId ? "baseline" : "candidate",
      pinned: slot.id === slotId,
    })),
  };
}

export function baselineSlot(state: ComparisonState): RunSlot | undefined {
  return state.slots.find((slot) => slot.role === "baseline") ?? state.slots[0];
}

export function candidateSlots(state: ComparisonState): RunSlot[] {
  const baseline = baselineSlot(state);
  return baseline ? state.slots.filter((slot) => slot.id !== baseline.id) : state.slots;
}

export function setPanel(state: ComparisonState, panel: ComparisonPanel): ComparisonState {
  return { ...state, activePanel: panel };
}

export function hydrateSlots(slots: RunSlot[], availableRunIds: string[]): RunSlot[] {
  const valid = new Set(availableRunIds);
  const filtered = slots.filter((slot) => valid.has(slot.runId)).slice(0, MAX_COMPARISON_RUNS);
  if (filtered.length < MIN_COMPARISON_RUNS) return [];
  const unique = filtered.filter((slot, index) => filtered.findIndex((s) => s.runId === slot.runId) === index);
  const hasBaseline = unique.some((slot) => slot.role === "baseline");
  if (!hasBaseline && unique.length > 0) unique[0] = { ...unique[0], role: "baseline", pinned: true };
  return unique;
}
