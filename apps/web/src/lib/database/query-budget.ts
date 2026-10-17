// Issue #1845: Query budget enforcement to prevent N+1 queries

export class QueryBudgetExceededError extends Error {
  constructor(
    public route: string,
    public budget: number,
    public actual: number
  ) {
    super(
      `Query budget exceeded for ${route}: ${actual} requests made (budget: ${budget})`
    );
    this.name = 'QueryBudgetExceededError';
  }
}

class QueryBudgetTracker {
  private counts: Map<string, number> = new Map();
  private budgets: Map<string, number> = new Map();

  /**
   * Set query budget for a specific route or operation
   */
  setBudget(key: string, maxRequests: number): void {
    this.budgets.set(key, maxRequests);
    this.counts.set(key, 0);
  }

  /**
   * Record a query execution
   * Throws if budget exceeded
   */
  recordQuery(key: string): void {
    const budget = this.budgets.get(key);
    if (!budget) {
      // No budget set, just count
      const current = this.counts.get(key) || 0;
      this.counts.set(key, current + 1);
      return;
    }

    const current = this.counts.get(key) || 0;
    const newCount = current + 1;

    if (newCount > budget) {
      throw new QueryBudgetExceededError(key, budget, newCount);
    }

    this.counts.set(key, newCount);

    // Warn at 80% of budget
    if (newCount >= budget * 0.8) {
      console.warn(
        `[query-budget] Approaching budget for ${key}: ${newCount}/${budget} queries`
      );
    }
  }

  /**
   * Get current query count for a route
   */
  getCount(key: string): number {
    return this.counts.get(key) || 0;
  }

  /**
   * Reset counts for a route
   */
  reset(key?: string): void {
    if (key) {
      this.counts.set(key, 0);
    } else {
      this.counts.clear();
    }
  }

  /**
   * Get all tracked routes with their counts and budgets
   */
  getReport(): Record<string, { count: number; budget?: number; exceeded: boolean }> {
    const report: Record<string, { count: number; budget?: number; exceeded: boolean }> = {};

    for (const [key, count] of this.counts.entries()) {
      const budget = this.budgets.get(key);
      report[key] = {
        count,
        budget,
        exceeded: budget ? count > budget : false,
      };
    }

    return report;
  }
}

// Global singleton tracker
export const queryBudget = new QueryBudgetTracker();

// Common budget presets
export const QUERY_BUDGETS = {
  RUN_DETAIL: 10, // Run detail page: max 10 requests
  CAMPAIGN_DASHBOARD: 15, // Campaign dashboard: max 15 requests
  ARTIFACT_LIST: 5, // Artifact listing: max 5 requests
  SEED_BATCH: 20, // Seed batch operations: max 20 requests
} as const;
