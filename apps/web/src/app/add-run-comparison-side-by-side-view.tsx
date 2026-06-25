"use client";

import { useMemo, useState } from "react";
import type { FuzzingRun } from "./types";
import {
  type SideBySideDataState,
  buildSideBySideRows,
  formatDeltaLabel,
  getSideBySideStateMessage,
  selectComparableRuns,
  summarizeSideBySideRows,
} from "./add-run-comparison-side-by-side-view-utils";

interface AddRunComparisonSideBySideViewProps {
  runs: FuzzingRun[];
  dataState: SideBySideDataState;
  onRetry: () => void;
}

const STATUS_COLORS: Record<FuzzingRun["status"], string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const CLASSIFICATION_STYLES = {
  regression: "text-red-600 dark:text-red-400",
  improvement: "text-green-600 dark:text-green-400",
  stable: "text-zinc-500 dark:text-zinc-400",
  neutral: "text-zinc-500 dark:text-zinc-400",
} as const;

function RunPanelHeader({
  label,
  run,
}: {
  label: string;
  run: FuzzingRun | null;
}) {
  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="mt-2 text-sm text-zinc-500">Select a run below</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{run.id}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status]}`}>
          {run.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {run.area} · {run.severity}
      </p>
    </div>
  );
}

export default function AddRunComparisonSideBySideView({
  runs,
  dataState,
  onRetry,
}: AddRunComparisonSideBySideViewProps) {
  const comparableRuns = useMemo(() => selectComparableRuns(runs), [runs]);
  const statusMessage = getSideBySideStateMessage(dataState, comparableRuns.length);

  const [leftRunId, setLeftRunId] = useState<string>("");
  const [rightRunId, setRightRunId] = useState<string>("");

  const leftRun = comparableRuns.find((run) => run.id === leftRunId) ?? null;
  const rightRun = comparableRuns.find((run) => run.id === rightRunId) ?? null;

  const rows = useMemo(() => {
    if (!leftRun || !rightRun) return [];
    return buildSideBySideRows(leftRun, rightRun);
  }, [leftRun, rightRun]);

  const summary = useMemo(() => summarizeSideBySideRows(rows), [rows]);

  const swapRuns = () => {
    setLeftRunId(rightRunId);
    setRightRunId(leftRunId);
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
          Run Comparison
        </p>
        <h2 className="text-2xl font-bold tracking-tight">Side-by-side run comparison</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{statusMessage.detail}</p>
      </div>

      {dataState !== "success" ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{statusMessage.title}</p>
          {dataState === "error" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Retry loading runs
            </button>
          )}
        </div>
      ) : comparableRuns.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{statusMessage.title}</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
            <div className="space-y-2">
              <label htmlFor="side-by-side-left-run" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Left run (baseline)
              </label>
              <select
                id="side-by-side-left-run"
                value={leftRunId}
                onChange={(event) => setLeftRunId(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select a run...</option>
                {comparableRuns.map((run) => (
                  <option key={run.id} value={run.id} disabled={run.id === rightRunId}>
                    {run.id} — {run.area} ({run.status})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={swapRuns}
              disabled={!leftRunId || !rightRunId}
              aria-label="Swap left and right runs"
              className="rounded-full border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ⇄ Swap
            </button>

            <div className="space-y-2">
              <label htmlFor="side-by-side-right-run" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Right run (candidate)
              </label>
              <select
                id="side-by-side-right-run"
                value={rightRunId}
                onChange={(event) => setRightRunId(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select a run...</option>
                {comparableRuns.map((run) => (
                  <option key={run.id} value={run.id} disabled={run.id === leftRunId}>
                    {run.id} — {run.area} ({run.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <RunPanelHeader label="Left panel" run={leftRun} />
            <RunPanelHeader label="Right panel" run={rightRun} />
          </div>

          {rows.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <span>{summary.differing} differing fields</span>
                <span className="text-red-600 dark:text-red-400">{summary.regressions} regressions</span>
                <span className="text-green-600 dark:text-green-400">{summary.improvements} improvements</span>
              </div>

              <div
                className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
                role="table"
                aria-label="Side-by-side run comparison"
              >
                <div
                  className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
                  role="row"
                >
                  <span role="columnheader">Left</span>
                  <span role="columnheader" className="text-center">
                    Field
                  </span>
                  <span role="columnheader" className="text-right">
                    Right
                  </span>
                  <span role="columnheader" className="text-right">
                    Delta
                  </span>
                </div>

                {rows.map((row) => (
                  <div
                    key={row.key}
                    className={`grid grid-cols-[1fr_auto_1fr_auto] gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-900 ${
                      row.differs ? "bg-amber-50/40 dark:bg-amber-950/10" : ""
                    }`}
                    role="row"
                  >
                    <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100" role="cell">
                      {row.leftValue}
                    </span>
                    <span className="min-w-[7rem] text-center text-sm font-medium text-zinc-700 dark:text-zinc-300" role="cell">
                      {row.label}
                    </span>
                    <span className="text-right font-mono text-sm text-zinc-900 dark:text-zinc-100" role="cell">
                      {row.rightValue}
                    </span>
                    <span
                      className={`text-right text-sm font-semibold ${CLASSIFICATION_STYLES[row.classification]}`}
                      role="cell"
                    >
                      {row.deltaPercent === null ? "—" : formatDeltaLabel(row.deltaPercent)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500">Select two different runs to open the side-by-side comparison.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
