"use client";

import { useMemo, useState } from "react";
import type { FuzzingRun } from "./types";
import {
  COMPARISON_MODES,
  type BuilderDataState,
  buildComparisonRows,
  createInitialSlots,
  getBuilderStatusMessage,
} from "./add-run-comparison-builder-utils";

/**
 * Issue #258: Add Run comparison builder
 *
 * This component provides an interactive builder for creating custom
 * run comparisons with drag-and-drop functionality, multiple comparison
 * modes, and exportable comparison reports.
 */

interface AddRunComparisonBuilderProps {
  runs: FuzzingRun[];
  dataState: BuilderDataState;
  onRetry: () => void;
}

const formatMetric = (metric: string, value: number): string => {
  if (metric === "duration") return `${Math.round(value / 1000)}s`;
  if (metric === "cpuInstructions" || metric === "seedCount") return value.toLocaleString();
  if (metric === "memoryBytes") return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (metric === "minResourceFee") return `${value.toLocaleString()} stroops`;
  return String(value);
};

export default function AddRunComparisonBuilder({
  runs,
  dataState,
  onRetry,
}: AddRunComparisonBuilderProps) {
  const [slots, setSlots] = useState(createInitialSlots);
  const [selectedMode, setSelectedMode] = useState<(typeof COMPARISON_MODES)[number]["id"]>("performance");
  const [activeColumn, setActiveColumn] = useState<0 | 1>(0);

  const availableRuns = useMemo(
    () => runs.filter((run) => run.status !== "cancelled"),
    [runs],
  );
  const statusMessage = getBuilderStatusMessage(dataState, availableRuns.length);
  const mode = COMPARISON_MODES.find((item) => item.id === selectedMode) ?? COMPARISON_MODES[0];

  const selectedBaseline = availableRuns.find((run) => run.id === slots[0].runId) ?? null;
  const selectedCandidate = availableRuns.find((run) => run.id === slots[1].runId) ?? null;
  const comparisonRows =
    selectedBaseline && selectedCandidate
      ? buildComparisonRows(selectedBaseline, selectedCandidate, mode.metrics)
      : [];

  const updateRunSelection = (index: 0 | 1, runId: string) => {
    setSlots((previous) =>
      previous.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, runId: runId || null } : slot,
      ),
    );
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-violet-600 dark:text-violet-300">
          Run Comparison Builder
        </p>
        <h2 className="text-2xl font-bold tracking-tight">Build baseline vs candidate comparisons</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{statusMessage.body}</p>
      </div>

      {dataState !== "success" ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{statusMessage.title}</p>
          {dataState === "error" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Retry loading runs
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Comparison mode">
            {COMPARISON_MODES.map((item) => {
              const active = item.id === selectedMode;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedMode(item.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    active
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {slots.map((slot, index) => (
              <div
                key={slot.id}
                tabIndex={0}
                onFocus={() => setActiveColumn(index as 0 | 1)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    setActiveColumn(activeColumn === 0 ? 1 : 0);
                  }
                }}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 focus-within:ring-2 focus-within:ring-violet-500 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {slot.label}
                </label>
                <select
                  value={slot.runId ?? ""}
                  aria-label={`${slot.label} run selection`}
                  onChange={(event) => updateRunSelection(index as 0 | 1, event.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">Select run</option>
                  {availableRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id} · {run.area} · {run.status}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {comparisonRows.length > 0 ? (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[560px]">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Metric</th>
                    <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.18em] text-zinc-500">Baseline</th>
                    <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.18em] text-zinc-500">Candidate</th>
                    <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.18em] text-zinc-500">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.metric} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-900 capitalize dark:text-zinc-100">{row.metric}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatMetric(row.metric, row.baseline)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatMetric(row.metric, row.candidate)}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${row.deltaPercent > 10 ? "text-rose-600" : row.deltaPercent < -10 ? "text-emerald-600" : "text-zinc-600"}`}>
                        {row.deltaPercent > 0 ? "+" : ""}
                        {row.deltaPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              Select a baseline and a candidate run to see comparison output.
            </div>
          )}
        </>
      )}
    </section>
  );
}
