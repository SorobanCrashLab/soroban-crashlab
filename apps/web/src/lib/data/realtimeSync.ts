// WIP scaffold for issue #2276. Patches a single cache entry from an SSE event; no
// subscription wiring to the real SSE stream (#002) yet.
import { queryCache } from "./queryClient";
import type { QueryKey } from "./queryKeys";

export function patchFromRealtimeEvent<T extends Record<string, unknown>>(
  key: QueryKey,
  patch: Partial<T>,
): void {
  const existing = queryCache.get<T>(key);
  if (!existing) return;
  queryCache.set(key, { ...existing.data, ...patch });
}
