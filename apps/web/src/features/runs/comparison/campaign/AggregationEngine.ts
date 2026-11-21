/** Statistical aggregation for campaign-level run comparison. */

import type { FuzzingRun } from "@/app/types";
import { COMPARISON_METRICS, readMetric } from "../metrics";
import type { AggregateStats, CampaignAggregate } from "../types";

/** Linear-interpolation percentile (p50 === median). */
export function percentile(sortedValues: number[], percentileRank: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.min(1, Math.max(0, percentileRank));
  const position = (sortedValues.length - 1) * rank;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function aggregate(values: number[]): AggregateStats {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, min: 0, max: 0, median: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: percentile(sorted, 0.5),
    mean: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

export function aggregateCampaign(
  campaignId: string,
  runs: FuzzingRun[],
  metricKeys: string[] = COMPARISON_METRICS.map((metric) => metric.key),
): CampaignAggregate {
  const byMetric: Record<string, AggregateStats> = {};
  for (const key of metricKeys) {
    const values = runs
      .map((run) => readMetric(run, key))
      .filter((value): value is number => value !== null);
    byMetric[key] = aggregate(values);
  }
  return { campaignId, runCount: runs.length, byMetric };
}

export function aggregateCampaigns(runs: FuzzingRun[]): CampaignAggregate[] {
  const groups = new Map<string, FuzzingRun[]>();
  for (const run of runs) {
    const campaignId = run.campaignId ?? "uncategorized";
    const group = groups.get(campaignId) ?? [];
    group.push(run);
    groups.set(campaignId, group);
  }
  return Array.from(groups.entries())
    .map(([campaignId, campaignRuns]) => aggregateCampaign(campaignId, campaignRuns))
    .sort((a, b) => b.runCount - a.runCount);
}

export function compareAggregates(baseline: CampaignAggregate, candidate: CampaignAggregate): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, stats] of Object.entries(baseline.byMetric)) {
    const candidateStats = candidate.byMetric[key];
    result[key] = candidateStats && stats.median !== 0 ? ((candidateStats.median - stats.median) / stats.median) * 100 : null;
  }
  return result;
}
