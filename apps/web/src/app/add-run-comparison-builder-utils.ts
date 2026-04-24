import type { FuzzingRun } from "./types";

export type BuilderDataState = "loading" | "error" | "success";
export type ComparisonMetric =
  | "duration"
  | "cpuInstructions"
  | "memoryBytes"
  | "minResourceFee"
  | "seedCount";

export interface ComparisonMode {
  id: "performance" | "cost" | "coverage";
  name: string;
  metrics: ComparisonMetric[];
}

export interface ComparisonSlot {
  id: string;
  label: string;
  runId: string | null;
}

export interface ComparisonRow {
  metric: ComparisonMetric;
  baseline: number;
  candidate: number;
  deltaPercent: number;
}

export const COMPARISON_MODES: ComparisonMode[] = [
  { id: "performance", name: "Performance", metrics: ["duration", "cpuInstructions", "memoryBytes"] },
  { id: "cost", name: "Cost", metrics: ["minResourceFee", "cpuInstructions", "memoryBytes"] },
  { id: "coverage", name: "Coverage", metrics: ["seedCount", "duration"] },
];

export function createInitialSlots(): ComparisonSlot[] {
  return [
    { id: "baseline", label: "Baseline", runId: null },
    { id: "candidate", label: "Candidate", runId: null },
  ];
}

export function calculateDeltaPercent(baseline: number, candidate: number): number {
  if (baseline === 0) return 0;
  return ((candidate - baseline) / baseline) * 100;
}

export function buildComparisonRows(
  baseline: FuzzingRun,
  candidate: FuzzingRun,
  metrics: ComparisonMetric[],
): ComparisonRow[] {
  return metrics.map((metric) => {
    const baselineValue = baseline[metric] as number;
    const candidateValue = candidate[metric] as number;
    return {
      metric,
      baseline: baselineValue,
      candidate: candidateValue,
      deltaPercent: calculateDeltaPercent(baselineValue, candidateValue),
    };
  });
}

export function getBuilderStatusMessage(
  state: BuilderDataState,
  runCount: number,
): { title: string; body: string } {
  if (state === "loading") {
    return {
      title: "Loading runs for comparison",
      body: "Fetching dashboard run data and preparing selectable baselines.",
    };
  }
  if (state === "error") {
    return {
      title: "Unable to load comparison inputs",
      body: "Run data could not be loaded. Retry to restore the run comparison builder.",
    };
  }
  if (runCount < 2) {
    return {
      title: "Not enough runs to compare",
      body: "At least two runs are required to build a meaningful comparison.",
    };
  }
  return {
    title: "Comparison ready",
    body: "Select baseline and candidate runs to compare metrics.",
  };
}
