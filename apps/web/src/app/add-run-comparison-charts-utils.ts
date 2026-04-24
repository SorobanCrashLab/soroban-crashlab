import type { FuzzingRun } from "./types";

export type ChartsDataState = "loading" | "error" | "success";
export type ComparisonMetric = "duration" | "cpuInstructions" | "memoryBytes" | "minResourceFee";

export interface ChartRow extends FuzzingRun {
  value: number;
  delta: number;
  percentage: number;
  baseline: boolean;
}

export function computeDeltaPercent(baseline: number, value: number): number {
  if (baseline === 0) {
    return 0;
  }
  return ((value - baseline) / baseline) * 100;
}

export function selectChartRuns(runs: FuzzingRun[]): FuzzingRun[] {
  const preferred = runs.filter((run) => run.status !== "cancelled").slice(0, 6);
  return preferred.length > 0 ? preferred : runs.slice(0, 6);
}

export function buildChartRows(
  runs: FuzzingRun[],
  metric: ComparisonMetric,
  baselineRunId: string,
): ChartRow[] {
  if (runs.length === 0) {
    return [];
  }

  const baseline = runs.find((run) => run.id === baselineRunId) ?? runs[runs.length - 1];
  const baselineValue = baseline[metric];
  const maxValue = Math.max(...runs.map((run) => run[metric]), baselineValue, 1);

  return runs.map((run) => {
    const value = run[metric];
    return {
      ...run,
      value,
      delta: computeDeltaPercent(baselineValue, value),
      percentage: (value / maxValue) * 100,
      baseline: run.id === baseline.id,
    };
  });
}

export function summarizeChartRows(rows: ChartRow[]): {
  tracked: number;
  regressions: number;
  improvements: number;
  highestId: string;
} {
  if (rows.length === 0) {
    return { tracked: 0, regressions: 0, improvements: 0, highestId: "N/A" };
  }

  const nonBaseline = rows.filter((row) => !row.baseline);
  const highest = rows.reduce((best, current) => (current.value > best.value ? current : best), rows[0]);

  return {
    tracked: rows.length,
    regressions: nonBaseline.filter((row) => row.delta >= 10).length,
    improvements: nonBaseline.filter((row) => row.delta <= -10).length,
    highestId: highest.id,
  };
}

export function getChartsStateMessage(
  dataState: ChartsDataState,
  runCount: number,
): { title: string; detail: string } {
  if (dataState === "loading") {
    return {
      title: "Loading run comparison charts",
      detail: "Fetching dashboard runs and preparing chart baselines.",
    };
  }
  if (dataState === "error") {
    return {
      title: "Run comparison charts unavailable",
      detail: "Run data failed to load. Retry to restore chart comparisons.",
    };
  }
  if (runCount === 0) {
    return {
      title: "No runs available for charts",
      detail: "Run comparison charts will appear once dashboard run data exists.",
    };
  }
  return {
    title: "Charts ready",
    detail: "Switch metrics and baseline to inspect run-to-run deltas.",
  };
}
