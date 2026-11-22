// WIP scaffold for issue #2279. "select all filtered" mode not implemented yet.

export interface RowSelectionState {
  selectedIds: Set<string>;
  mode: "none" | "page" | "all";
}

export function toggleRow(state: RowSelectionState, id: string): RowSelectionState {
  const next = new Set(state.selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return { ...state, selectedIds: next };
}

export function clearSelection(): RowSelectionState {
  return { selectedIds: new Set(), mode: "none" };
}
