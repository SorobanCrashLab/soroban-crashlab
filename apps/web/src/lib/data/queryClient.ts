// WIP scaffold for issue #2276. TanStack Query is not a project dependency, so this is a
// minimal in-memory cache rather than a real query client — no background refetch,
// request dedup, or GC policy yet. Not wired into any provider (apps/web/src/app/providers.tsx
// does not exist yet either).
import type { QueryKey } from "./queryKeys";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class SimpleQueryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  private keyToString(key: QueryKey): string {
    return JSON.stringify(key);
  }

  get<T>(key: QueryKey): CacheEntry<T> | undefined {
    return this.store.get(this.keyToString(key)) as CacheEntry<T> | undefined;
  }

  set<T>(key: QueryKey, data: T): void {
    this.store.set(this.keyToString(key), { data, fetchedAt: Date.now() });
  }

  invalidate(key: QueryKey): void {
    this.store.delete(this.keyToString(key));
  }

  invalidatePrefix(prefix: QueryKey): void {
    const prefixStr = this.keyToString(prefix).slice(0, -1);
    for (const storedKey of this.store.keys()) {
      if (storedKey.startsWith(prefixStr)) this.store.delete(storedKey);
    }
  }
}

export const queryCache = new SimpleQueryCache();
