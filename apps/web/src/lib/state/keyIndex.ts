import type { StateMutation } from './normalizeSnapshots';

export interface IndexedStateKey {
  key: string;
  contractId: string;
  namespace: string;
  category: StateMutation['category'];
  mutations: StateMutation[];
  latestLedger?: number;
}

/** Build a stable, searchable index once instead of rescanning every event per keystroke. */
export function buildStateKeyIndex(mutations: readonly StateMutation[]): IndexedStateKey[] {
  const index = new Map<string, IndexedStateKey>();
  for (const mutation of mutations) {
    const existing = index.get(mutation.key);
    if (existing) {
      existing.mutations.push(mutation);
      if (mutation.ledger !== undefined) existing.latestLedger = Math.max(existing.latestLedger ?? mutation.ledger, mutation.ledger);
    } else {
      index.set(mutation.key, {
        key: mutation.key,
        contractId: mutation.contractId,
        namespace: mutation.namespace,
        category: mutation.category,
        mutations: [mutation],
        ...(mutation.ledger !== undefined ? { latestLedger: mutation.ledger } : {}),
      });
    }
  }
  return [...index.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function searchStateKeyIndex(index: readonly IndexedStateKey[], query: string): IndexedStateKey[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...index];
  return index.filter((entry) =>
    [entry.key, entry.contractId, entry.namespace, entry.category].some((value) => value.toLowerCase().includes(needle)),
  );
}
