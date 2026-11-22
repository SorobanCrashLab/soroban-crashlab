// WIP scaffold for issue #2273. In-memory only; no server-side version history yet.

import type { SavedViewRecord } from "./viewSchema";

export interface ViewVersion {
  versionId: string;
  snapshot: SavedViewRecord;
  savedAt: string;
}

export function recordVersion(history: ViewVersion[], snapshot: SavedViewRecord): ViewVersion[] {
  return [...history, { versionId: crypto.randomUUID(), snapshot, savedAt: new Date().toISOString() }];
}

export function restoreVersion(history: ViewVersion[], versionId: string): SavedViewRecord | null {
  return history.find((entry) => entry.versionId === versionId)?.snapshot ?? null;
}
