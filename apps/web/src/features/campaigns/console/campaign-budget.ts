/**
 * Budget caps and auto-stop evaluation for campaign management (#2258).
 * Caps are expressed in resource units (stroops) and wall-clock minutes.
 */

export interface CampaignBudget {
  maxRuns: number | null;
  maxStroops: number | null;
  maxMinutes: number | null;
  autoStop: boolean;
}

export interface CampaignUsage {
  runs: number;
  stroops: number;
  elapsedMinutes: number;
}

export type BudgetDecision =
  | { action: 'continue' }
  | { action: 'stop'; reason: 'runs' | 'stroops' | 'minutes'; limit: number; usage: number };

export const UNLIMITED_BUDGET: CampaignBudget = {
  maxRuns: null,
  maxStroops: null,
  maxMinutes: null,
  autoStop: false,
};

export function validateBudget(budget: CampaignBudget): string | null {
  const values: (number | null)[] = [budget.maxRuns, budget.maxStroops, budget.maxMinutes];
  if (values.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    return 'Budget caps must be non-negative numbers.';
  }
  return null;
}

/** Evaluate usage against caps. Auto-stop only takes effect when enabled. */
export function evaluateBudget(budget: CampaignBudget, usage: CampaignUsage): BudgetDecision {
  if (!budget.autoStop) return { action: 'continue' };
  const checks: { limit: number | null; usage: number; reason: 'runs' | 'stroops' | 'minutes' }[] = [
    { limit: budget.maxRuns, usage: usage.runs, reason: 'runs' },
    { limit: budget.maxStroops, usage: usage.stroops, reason: 'stroops' },
    { limit: budget.maxMinutes, usage: usage.elapsedMinutes, reason: 'minutes' },
  ];
  for (const check of checks) {
    if (check.limit !== null && check.usage >= check.limit) {
      return { action: 'stop', reason: check.reason, limit: check.limit, usage: check.usage };
    }
  }
  return { action: 'continue' };
}

export function remainingBudget(budget: CampaignBudget, usage: CampaignUsage): CampaignUsage {
  return {
    runs: budget.maxRuns === null ? Number.POSITIVE_INFINITY : Math.max(0, budget.maxRuns - usage.runs),
    stroops: budget.maxStroops === null ? Number.POSITIVE_INFINITY : Math.max(0, budget.maxStroops - usage.stroops),
    elapsedMinutes: budget.maxMinutes === null ? Number.POSITIVE_INFINITY : Math.max(0, budget.maxMinutes - usage.elapsedMinutes),
  };
}

export function formatStroops(stroops: number): string {
  if (!Number.isFinite(stroops)) return '∞';
  if (stroops < 1_000) return `${stroops}`;
  if (stroops < 1_000_000) return `${(stroops / 1_000).toFixed(1)}K`;
  if (stroops < 1_000_000_000) return `${(stroops / 1_000_000).toFixed(1)}M`;
  return `${(stroops / 1_000_000_000).toFixed(2)}B`;
}
