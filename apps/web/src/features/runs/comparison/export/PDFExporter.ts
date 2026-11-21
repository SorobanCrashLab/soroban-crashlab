/**
 * Print-ready PDF report generation.
 *
 * Uses the browser print pipeline rather than a heavy renderer dependency so
 * the workbench stays under its bundle budget. `buildReportHtml` is pure and
 * unit-testable; `printReport` opens a sandboxed print window.
 */

import type { FuzzingRun } from "@/app/types";
import { computeMetricDeltas, formatDeltaPercent } from "../metrics";
import { summarizeCorrelation, correlateCrashes } from "../sync/CrashCorrelator";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character] ?? character;
  });
}

export function buildReportHtml(baseline: FuzzingRun | null, candidates: FuzzingRun[]): string {
  const rows = baseline
    ? candidates.flatMap((candidate) =>
        computeMetricDeltas(baseline, candidate).map(
          (delta) =>
            `<tr><td>${escapeHtml(delta.label)}</td><td>${escapeHtml(candidate.id)}</td><td>${escapeHtml(delta.baselineDisplay)}</td><td>${escapeHtml(delta.candidateDisplay)}</td><td>${escapeHtml(formatDeltaPercent(delta.deltaPercent))}</td></tr>`,
        ),
      )
    : [];
  const crashSummary = summarizeCorrelation(
    baseline ? candidates.map((candidate) => correlateCrashes(baseline, candidate)) : [],
  );

  return `<!doctype html><html><head><meta charset="utf-8"><title>Run Comparison Report</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#18181b}h1{font-size:1.5rem}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{border:1px solid #d4d4d8;padding:.4rem;text-align:left}th{background:#f4f4f5}@media print{body{margin:1cm}}</style>
</head><body><h1>Soroban CrashLab — Run Comparison</h1>
<p>Baseline: ${escapeHtml(baseline?.id ?? "none")} · Candidates: ${candidates.length} · Generated: ${escapeHtml(new Date().toISOString())}</p>
<p>Matched crashes: ${crashSummary.matched} · New: ${crashSummary.newCrashes} · Removed: ${crashSummary.removedCrashes}</p>
<table><thead><tr><th>Metric</th><th>Candidate</th><th>Baseline</th><th>Candidate value</th><th>Δ</th></tr></thead><tbody>${rows.join("")}</tbody></table>
</body></html>`;
}

export function printReport(html: string): boolean {
  if (typeof window === "undefined") return false;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}
