// WIP scaffold for issue #2273. No size-safe compression for large view state yet —
// see apps/web/src/app/saved-views/view-state.ts for the existing versioned codec this
// should eventually generalize.

import type { SavedViewRecord } from "./viewSchema";

export function encodeViewToQuery(view: SavedViewRecord): string {
  const params = new URLSearchParams();
  params.set("view", encodeURIComponent(JSON.stringify({ query: view.query, columns: view.columns })));
  return params.toString();
}

export function decodeViewFromQuery(search: string): Partial<SavedViewRecord> | null {
  const params = new URLSearchParams(search);
  const raw = params.get("view");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}
