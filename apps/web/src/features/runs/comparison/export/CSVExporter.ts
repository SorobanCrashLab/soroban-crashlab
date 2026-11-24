/** CSV export for the metrics delta table. */

import type { FuzzingRun } from "@/app/types";
import { computeMetricDeltas, formatDeltaPercent } from "../metrics";

function escapeCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(cells: Array<string | number | null>): string {
  return cells.map(escapeCell).join(",");
}

export function buildMetricsCSV(baseline: FuzzingRun | null, candidates: FuzzingRun[]): string {
  if (!baseline || candidates.length === 0) return "";
  const deltasByCandidate = candidates.map((candidate) => ({
    candidate,
    deltas: computeMetricDeltas(baseline, candidate),
  }));
  const metricKeys = deltasByCandidate[0]?.deltas.map((delta) => delta.key) ?? [];

  const lines = [
    row(["metric", "baseline_run", "baseline_value", ...candidates.map((candidate) => candidate.id), ...candidates.map((candidate) => `${candidate.id}_delta_percent`)]),
  ];
  for (const key of metricKeys) {
    const baselineDelta = deltasByCandidate[0].deltas.find((delta) => delta.key === key);
    lines.push(
      row([
        baselineDelta?.label ?? key,
        baseline.id,
        baselineDelta?.baseline ?? null,
        ...deltasByCandidate.map(({ deltas }) => deltas.find((delta) => delta.key === key)?.candidate ?? null),
        ...deltasByCandidate.map(({ deltas }) => formatDeltaPercent(deltas.find((delta) => delta.key === key)?.deltaPercent ?? null)),
      ]),
    );
  }
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, mimeType = "text/plain"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
