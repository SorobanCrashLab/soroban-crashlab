// WIP scaffold for issue #2272 (Bulk Operations Framework). Generalizes the existing
// runs-only selection logic in apps/web/src/app/runs-bulk-actions-utils.ts; that file is
// not migrated yet.

export type SelectionMode = "none" | "page" | "all-filtered" | "manual";

export interface SelectionState {
  mode: SelectionMode;
  manualIds: Set<string>;
  totalFilteredCount: number;
}

export function emptySelection(totalFilteredCount = 0): SelectionState {
  return { mode: "none", manualIds: new Set(), totalFilteredCount };
}

export function selectedCount(state: SelectionState, pageSize: number): number {
  if (state.mode === "all-filtered") return state.totalFilteredCount;
  if (state.mode === "page") return pageSize;
  return state.manualIds.size;
}
