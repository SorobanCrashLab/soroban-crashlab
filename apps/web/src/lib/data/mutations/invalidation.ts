// WIP scaffold for issue #2276. Scoped invalidation only; no background refetch trigger yet.
import { queryCache } from "../queryClient";
import type { QueryKey } from "../queryKeys";

export function invalidateQueries(keys: QueryKey[]): void {
  for (const key of keys) {
    queryCache.invalidatePrefix(key);
  }
}
