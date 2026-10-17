// Issue #1845: Repository layer with query budget tracking and coherent caching

import { queryBudget, QUERY_BUDGETS } from './query-budget';

export interface CacheOptions {
  ttl: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

export interface RunSummary {
  id: string;
  status: string;
  artifactCount: number;
  seedCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Repository for run detail queries with budget enforcement
 */
export class RunRepository {
  constructor(private budgetKey: string = 'run-detail') {
    // Set budget for run detail queries
    queryBudget.setBudget(this.budgetKey, QUERY_BUDGETS.RUN_DETAIL);
  }

  /**
   * Fetch run summary with denormalized counts (single query)
   * Replaces N+1 pattern of: fetch run → fetch artifacts → fetch seeds
   */
  async getRunSummary(runId: string): Promise<RunSummary> {
    queryBudget.recordQuery(this.budgetKey);

    // Simulated batch query that fetches run + counts in one go
    // TODO: Replace with actual database query
    console.log(`[RunRepository] Fetching summary for run ${runId}`);

    return {
      id: runId,
      status: 'completed',
      artifactCount: 42,
      seedCount: 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Batch fetch multiple runs (avoids N queries for N runs)
   */
  async getRunSummaries(runIds: string[]): Promise<RunSummary[]> {
    queryBudget.recordQuery(this.budgetKey);

    // Single batch query instead of individual queries
    console.log(`[RunRepository] Batch fetching ${runIds.length} runs`);

    return runIds.map((id) => ({
      id,
      status: 'completed',
      artifactCount: 42,
      seedCount: 1000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Reset query budget counter (call between requests)
   */
  resetBudget(): void {
    queryBudget.reset(this.budgetKey);
  }
}

/**
 * Cache manager with tag-based invalidation
 */
class CacheManager {
  private cache: Map<string, { value: unknown; expiresAt: number; tags: string[] }> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();

  set(key: string, value: unknown, options: CacheOptions): void {
    const expiresAt = Date.now() + options.ttl * 1000;
    const tags = options.tags || [];

    this.cache.set(key, { value, expiresAt, tags });

    // Update tag index
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag) || new Set();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  invalidateByTag(tag: string): void {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;

    for (const key of keys) {
      this.cache.delete(key);
    }

    this.tagIndex.delete(tag);
    console.log(`[CacheManager] Invalidated ${keys.size} entries with tag: ${tag}`);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.tagIndex.clear();
  }
}

export const cacheManager = new CacheManager();
