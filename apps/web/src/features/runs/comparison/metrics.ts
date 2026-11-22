/** Metric definitions and delta calculation for the comparison workbench. */

import type { FuzzingRun } from "@/app/types";
import type { DeltaClassification, MetricDefinition, MetricDelta } from "./types";

export const STABLE_THRESHOLD_PERCENT = 10;

export const COMPARISON_METRICS: MetricDefinition[] = [
  { key: "duration", label: "Duration", unit: "ms", lowerIsBetter: true },
  { key: "cpuInstructions", label: "CPU Instructions", unit: "instr", lowerIsBetter: true },
  { key: "memoryBytes", label: "Memory", unit: "bytes", lowerIsBetter: true },
  { key: "minResourceFee", label: "Min Resource Fee", unit: "stroops", lowerIsBetter: true },
  { key: "seedCount", label: "Seeds Executed", unit: "seeds", lowerIsBetter: false },
];

/** Read a numeric metric from a run, including optional nested envelopes. */
export function readMetric(run: FuzzingRun, key: string): number | null {
  switch (key) {
    case "duration":
    case "cpuInstructions":
    case "memoryBytes":
    case "minResourceFee":
    case "seedCount": {
      const value = run[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "inclusionFee":
      return run.fee?.inclusionFee ?? null;
    case "rentBumps":
      return run.fee?.rentBumps ?? null;
    default:
      return null;
  }
}

export function computeDeltaPercent(baseline: number, candidate: number): number | null {
  if (baseline === 0 || !Number.isFinite(baseline) || !Number.isFinite(candidate)) return null;
  const delta = ((candidate - baseline) / baseline) * 100;
  return Number.isFinite(delta) ? delta : null;
}

export function classifyDeltaPercent(
  deltaPercent: number | null,
  lowerIsBetter: boolean,
): DeltaClassification {
  if (deltaPercent === null) return "neutral";
  if (Math.abs(deltaPercent) < STABLE_THRESHOLD_PERCENT) return "stable";
  const worse = lowerIsBetter ? deltaPercent > 0 : deltaPercent < 0;
  return worse ? "regression" : "improvement";
}

export function formatDeltaPercent(deltaPercent: number | null): string {
  if (deltaPercent === null) return "—";
  const sign = deltaPercent > 0 ? "+" : "";
  return `${sign}${deltaPercent.toFixed(1)}%`;
}

export function formatMetricValue(key: string, value: number): string {
  switch (key) {
    case "duration":
      return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
    case "memoryBytes":
      return value >= 1024 * 1024
        ? `${(value / (1024 * 1024)).toFixed(2)} MB`
        : `${(value / 1024).toFixed(1)} KB`;
    case "cpuInstructions":
    case "seedCount":
      return Math.round(value).toLocaleString();
    case "minResourceFee":
    case "inclusionFee":
      return `${Math.round(value).toLocaleString()} stroops`;
    default:
      return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
}

/** Build a delta row per metric. Runs with missing metrics are skipped. */
export function computeMetricDeltas(
  baseline: FuzzingRun,
  candidate: FuzzingRun,
  definitions: MetricDefinition[] = COMPARISON_METRICS,
): MetricDelta[] {
  const deltas: MetricDelta[] = [];
  for (const definition of definitions) {
    const baselineValue = readMetric(baseline, definition.key);
    const candidateValue = readMetric(candidate, definition.key);
    if (baselineValue === null || candidateValue === null) continue;

    const absoluteDelta = candidateValue - baselineValue;
    const deltaPercent = computeDeltaPercent(baselineValue, candidateValue);
    const direction = absoluteDelta > 0 ? "up" : absoluteDelta < 0 ? "down" : "flat";
    deltas.push({
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      baseline: baselineValue,
      candidate: candidateValue,
      absoluteDelta,
      deltaPercent,
      direction,
      classification: classifyDeltaPercent(deltaPercent, definition.lowerIsBetter),
      baselineDisplay: formatMetricValue(definition.key, baselineValue),
      candidateDisplay: formatMetricValue(definition.key, candidateValue),
    });
  }
  return deltas;
}

/** Compute deltas for all candidates against a single baseline. */
export function computeComparisonMatrix(
  runs: FuzzingRun[],
  baselineId: string,
): Map<string, MetricDelta[]> {
  const baseline = runs.find((run) => run.id === baselineId);
  const matrix = new Map<string, MetricDelta[]>();
  if (!baseline) return matrix;
  for (const run of runs) {
    if (run.id === baselineId) continue;
    matrix.set(run.id, computeMetricDeltas(baseline, run));
  }
  return matrix;
}

export function summarizeDeltas(deltas: MetricDelta[]): {
  regressions: number;
  improvements: number;
  stable: number;
  neutral: number;
} {
  return {
    regressions: deltas.filter((d) => d.classification === "regression").length,
    improvements: deltas.filter((d) => d.classification === "improvement").length,
    stable: deltas.filter((d) => d.classification === "stable").length,
    neutral: deltas.filter((d) => d.classification === "neutral").length,
  };
}
