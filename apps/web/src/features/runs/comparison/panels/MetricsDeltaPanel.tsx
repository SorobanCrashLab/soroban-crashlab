"use client";

import type { FuzzingRun } from "@/app/types";
import { computeMetricDeltas, formatDeltaPercent } from "../metrics";
import type { DeltaClassification, MetricDelta } from "../types";

const CLASSIFICATION_CLASS: Record<DeltaClassification, string> = {
  regression: "text-red-600 dark:text-red-400",
  improvement: "text-green-600 dark:text-green-400",
  stable: "text-zinc-500 dark:text-zinc-400",
  neutral: "text-zinc-400 dark:text-zinc-500",
};

const CLASSIFICATION_LABEL: Record<DeltaClassification, string> = {
  regression: "worse",
  improvement: "better",
  stable: "stable",
  neutral: "no comparison",
};

function DeltaCell({ delta, runId }: { delta: MetricDelta | undefined; runId: string }) {
  if (!delta) return <td className="px-3 py-2 text-sm text-zinc-400">—</td>;
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "▬";
  return (
    <td className={`px-3 py-2 text-sm font-medium tabular-nums ${CLASSIFICATION_CLASS[delta.classification]}`}>
      <span aria-hidden="true">{arrow} </span>
      <span>{formatDeltaPercent(delta.deltaPercent)}</span>
      <span className="sr-only"> ({CLASSIFICATION_LABEL[delta.classification]} versus {runId})</span>
    </td>
  );
}

export interface MetricsDeltaPanelProps {
  baseline: FuzzingRun | null;
  candidates: FuzzingRun[];
}

export default function MetricsDeltaPanel({ baseline, candidates }: MetricsDeltaPanelProps) {
  if (!baseline || candidates.length === 0) {
    return (
      <section aria-label="Metrics delta" className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold">Metrics delta</h3>
        <p className="mt-2 text-sm text-zinc-500">Select at least two runs to compare metrics.</p>
      </section>
    );
  }

  const deltaRows = candidates.map((candidate) => ({
    candidate,
    deltas: computeMetricDeltas(baseline, candidate),
  }));
  const metricKeys = deltaRows[0]?.deltas.map((delta) => delta.key) ?? [];

  return (
    <section aria-label="Metrics delta" className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold">Metrics delta</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Numeric metric changes relative to baseline {baseline.id}</caption>
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Metric
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Baseline
              </th>
              {candidates.map((candidate) => (
                <th
                  key={candidate.id}
                  scope="col"
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {candidate.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricKeys.map((key) => {
              const first = deltaRows[0].deltas.find((delta) => delta.key === key);
              return (
                <tr key={key} className="border-b border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="px-3 py-2 text-sm font-medium">
                    {first?.label ?? key}
                  </th>
                  <td className="px-3 py-2 text-sm tabular-nums">{first?.baselineDisplay ?? "—"}</td>
                  {deltaRows.map(({ candidate, deltas }) => (
                    <DeltaCell
                      key={candidate.id}
                      runId={candidate.id}
                      delta={deltas.find((delta) => delta.key === key)}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Change greater than 10% is highlighted as better (green) or worse (red) using each metric&apos;s direction.
      </p>
    </section>
  );
}
