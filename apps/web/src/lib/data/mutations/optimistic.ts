// WIP scaffold for issue #2276. Generic optimistic-update helper with manual rollback;
// no integration with a real mutation/query library yet.
import { queryCache } from "../queryClient";
import type { QueryKey } from "../queryKeys";

export async function runOptimisticUpdate<T>(
  key: QueryKey,
  optimisticData: T,
  mutate: () => Promise<T>,
): Promise<T> {
  const previous = queryCache.get<T>(key);
  queryCache.set(key, optimisticData);

  try {
    const result = await mutate();
    queryCache.set(key, result);
    return result;
  } catch (error) {
    if (previous) {
      queryCache.set(key, previous.data);
    } else {
      queryCache.invalidate(key);
    }
    throw error;
  }
}
