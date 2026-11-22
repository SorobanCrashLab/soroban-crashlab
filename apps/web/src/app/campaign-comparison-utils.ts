/**
 * Utilities for comparing fuzzing campaigns side-by-side
 */

import type { FuzzingRun } from "./types";

export interface CampaignMetrics {
  id: string;
  name: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  runningRuns: number;
  totalSeeds: number;
  avgDuration: number;
  totalCpuInstructions: number;
  totalMemoryBytes: number;
  criticalFailures: number;
  highFailures: number;
  mediumFailures: number;
  lowFailures: number;
}

export interface CampaignComparison {
  campaigns: CampaignMetrics[];
  commonFailures: string[];
  uniqueFailures: Record<string, string[]>;
}

export function aggregateCampaignMetrics(
  campaignId: string,
  campaignName: string,
  runs: FuzzingRun[],
): CampaignMetrics {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const cancelledRuns = runs.filter((r) => r.status === "cancelled").length;
  const runningRuns = runs.filter((r) => r.status === "running").length;

  const totalSeeds = runs.reduce((sum, r) => sum + (r.seedCount || 0), 0);
  const avgDuration =
    totalRuns > 0
      ? runs.reduce((sum, r) => sum + (r.duration || 0), 0) / totalRuns
      : 0;

  const totalCpuInstructions = runs.reduce(
    (sum, r) => sum + (r.cpuInstructions || 0),
    0,
  );
  const totalMemoryBytes = runs.reduce(
    (sum, r) => sum + (r.memoryBytes || 0),
    0,
  );

  const criticalFailures = runs.filter((r) => r.severity === "critical").length;
  const highFailures = runs.filter((r) => r.severity === "high").length;
  const mediumFailures = runs.filter((r) => r.severity === "medium").length;
  const lowFailures = runs.filter((r) => r.severity === "low").length;

  return {
    id: campaignId,
    name: campaignName,
    totalRuns,
    completedRuns,
    failedRuns,
    cancelledRuns,
    runningRuns,
    totalSeeds,
    avgDuration,
    totalCpuInstructions,
    totalMemoryBytes,
    criticalFailures,
    highFailures,
    mediumFailures,
    lowFailures,
  };
}

export function compareCampaigns(
  campaign1: { id: string; name: string; runs: FuzzingRun[] },
  campaign2: { id: string; name: string; runs: FuzzingRun[] },
): CampaignComparison {
  const metrics1 = aggregateCampaignMetrics(
    campaign1.id,
    campaign1.name,
    campaign1.runs,
  );
  const metrics2 = aggregateCampaignMetrics(
    campaign2.id,
    campaign2.name,
    campaign2.runs,
  );

  const failures1 = new Set(
    campaign1.runs
      .filter((r) => r.crashDetail)
      .map((r) => r.crashDetail!.signature),
  );

  const failures2 = new Set(
    campaign2.runs
      .filter((r) => r.crashDetail)
      .map((r) => r.crashDetail!.signature),
  );

  const commonFailures = Array.from(failures1).filter((f) => failures2.has(f));

  const uniqueFailures = {
    [campaign1.id]: Array.from(failures1).filter((f) => !failures2.has(f)),
    [campaign2.id]: Array.from(failures2).filter((f) => !failures1.has(f)),
  };

  return {
    campaigns: [metrics1, metrics2],
    commonFailures,
    uniqueFailures,
  };
}

export function calculateDifferencePercentage(
  value1: number,
  value2: number,
): number {
  if (value2 === 0) return value1 === 0 ? 0 : 100;
  return ((value1 - value2) / value2) * 100;
}

export function formatPercentage(value: number): string {
  const formatted = Math.abs(value).toFixed(1);
  return value > 0 ? `+${formatted}%` : value < 0 ? `-${formatted}%` : "0%";
}
