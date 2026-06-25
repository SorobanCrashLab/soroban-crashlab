import type { FuzzingRun } from "./types";

export type SideBySideDataState = "loading" | "error" | "success";

export type SideBySideMetric =
  | "duration"
  | "cpuInstructions"
  | "memoryBytes"
  | "minResourceFee"
  | "seedCount";

export type SideBySideFieldKind = "metric" | "text" | "tags";

export interface SideBySideField {
  key: string;
  label: string;
  kind: SideBySideFieldKind;
  metric?: SideBySideMetric;
}

export interface SideBySideRow {
  key: string;
  label: string;
  leftValue: string;
  rightValue: string;
  deltaPercent: number | null;
  differs: boolean;
  classification: "regression" | "improvement" | "stable" | "neutral";
}

export const SIDE_BY_SIDE_FIELDS: SideBySideField[] = [
  { key: "status", label: "Status", kind: "text" },
  { key: "area", label: "Area", kind: "text" },
  { key: "severity", label: "Severity", kind: "text" },
  { key: "duration", label: "Duration", kind: "metric", metric: "duration" },
  { key: "cpuInstructions", label: "CPU Instructions", kind: "metric", metric: "cpuInstructions" },
  { key: "memoryBytes", label: "Memory", kind: "metric", metric: "memoryBytes" },
  { key: "minResourceFee", label: "Min Resource Fee", kind: "metric", metric: "minResourceFee" },
  { key: "seedCount", label: "Seed Count", kind: "metric", metric: "seedCount" },
  { key: "tags", label: "Tags", kind: "tags" },
];

const LOWER_IS_BETTER: SideBySideMetric[] = [
  "duration",
  "cpuInstructions",
  "memoryBytes",
  "minResourceFee",
];

export function computeSideBySideDelta(baseline: number, candidate: number): number {
  if (baseline === 0) return 0;
  return ((candidate - baseline) / baseline) * 100;
}

export function classifyDelta(
  deltaPercent: number,
  metric?: SideBySideMetric,
): "regression" | "improvement" | "stable" {
  if (Math.abs(deltaPercent) < 10) return "stable";
  const lowerIsBetter = metric ? LOWER_IS_BETTER.includes(metric) : true;
  if (lowerIsBetter) {
    return deltaPercent > 10 ? "regression" : "improvement";
  }
  return deltaPercent > 10 ? "improvement" : "regression";
}

export function formatSideBySideMetric(metric: SideBySideMetric, value: number): string {
  if (metric === "duration") return `${Math.round(value / 1000)}s`;
  if (metric === "cpuInstructions" || metric === "seedCount") return value.toLocaleString();
  if (metric === "memoryBytes") {
    return value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (metric === "minResourceFee") return `${value.toLocaleString()} stroops`;
  return String(value);
}

export function formatSideBySideText(key: string, run: FuzzingRun): string {
  if (key === "status" || key === "area" || key === "severity") {
    return String(run[key as keyof FuzzingRun]);
  }
  return "—";
}

export function formatSideBySideTags(run: FuzzingRun): string {
  const tags = run.tags ?? [];
  return tags.length > 0 ? tags.join(", ") : "—";
}

export function buildSideBySideRows(left: FuzzingRun, right: FuzzingRun): SideBySideRow[] {
  return SIDE_BY_SIDE_FIELDS.map((field) => {
    if (field.kind === "metric" && field.metric) {
      const leftNum = left[field.metric] as number;
      const rightNum = right[field.metric] as number;
      const deltaPercent = computeSideBySideDelta(leftNum, rightNum);
      return {
        key: field.key,
        label: field.label,
        leftValue: formatSideBySideMetric(field.metric, leftNum),
        rightValue: formatSideBySideMetric(field.metric, rightNum),
        deltaPercent,
        differs: leftNum !== rightNum,
        classification: classifyDelta(deltaPercent, field.metric),
      };
    }

    if (field.kind === "tags") {
      const leftValue = formatSideBySideTags(left);
      const rightValue = formatSideBySideTags(right);
      return {
        key: field.key,
        label: field.label,
        leftValue,
        rightValue,
        deltaPercent: null,
        differs: leftValue !== rightValue,
        classification: "neutral",
      };
    }

    const leftValue = formatSideBySideText(field.key, left);
    const rightValue = formatSideBySideText(field.key, right);
    return {
      key: field.key,
      label: field.label,
      leftValue,
      rightValue,
      deltaPercent: null,
      differs: leftValue !== rightValue,
      classification: "neutral",
    };
  });
}

export function selectComparableRuns(runs: FuzzingRun[]): FuzzingRun[] {
  const preferred = runs.filter((run) => run.status !== "cancelled");
  return preferred.length > 0 ? preferred : runs;
}

export function getSideBySideStateMessage(
  dataState: SideBySideDataState,
  runCount: number,
): { title: string; detail: string } {
  if (dataState === "loading") {
    return {
      title: "Loading run comparison view",
      detail: "Fetching dashboard runs and preparing side-by-side comparison panels.",
    };
  }
  if (dataState === "error") {
    return {
      title: "Run comparison unavailable",
      detail: "Run data failed to load. Retry to restore the side-by-side comparison view.",
    };
  }
  if (runCount < 2) {
    return {
      title: "Not enough runs to compare",
      detail: "At least two runs are required for a side-by-side comparison.",
    };
  }
  return {
    title: "Comparison ready",
    detail: "Select two runs to inspect metrics and metadata in a side-by-side layout.",
  };
}

export function formatDeltaLabel(deltaPercent: number): string {
  const sign = deltaPercent > 0 ? "+" : "";
  return `${sign}${deltaPercent.toFixed(1)}%`;
}

export function summarizeSideBySideRows(rows: SideBySideRow[]): {
  differing: number;
  regressions: number;
  improvements: number;
} {
  return {
    differing: rows.filter((row) => row.differs).length,
    regressions: rows.filter((row) => row.classification === "regression").length,
    improvements: rows.filter((row) => row.classification === "improvement").length,
  };
}
