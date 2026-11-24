/**
 * Framework-agnostic synchronized cursor/brush store (#2302).
 */

export interface SyncState {
  cursor: number | null;
  range: [number, number] | null;
}

export interface SyncGroup {
  get(): SyncState;
  setCursor(t: number | null): void;
  setRange(range: [number, number] | null): void;
  subscribe(listener: () => void): () => void;
}

export function createSyncGroup(initial: Partial<SyncState> = {}): SyncGroup {
  let state: SyncState = { cursor: null, range: null, ...initial };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    setCursor(t) {
      if (state.cursor === t) return;
      state = { ...state, cursor: t };
      emit();
    },
    setRange(range) {
      const same =
        (range === null && state.range === null) ||
        (range !== null && state.range !== null && range[0] === state.range[0] && range[1] === state.range[1]);
      if (same) return;
      state = { ...state, range };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const groups = new Map<string, SyncGroup>();

export function getSyncGroup(id: string): SyncGroup {
  let g = groups.get(id);
  if (!g) {
    g = createSyncGroup();
    groups.set(id, g);
  }
  return g;
}
