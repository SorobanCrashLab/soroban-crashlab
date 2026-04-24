"use client";

import { useEffect, useMemo, useState } from "react";

export type MetricKey = "runtimeDelta" | "instructionDelta" | "memoryDelta";

export type HeatmapRun = {
  id: string;
  label: string;
  commit: string;
  runtimeDelta: number;
  instructionDelta: number;
  memoryDelta: number;
};

export type ContractHeatmapRow = {
  contract: string;
  suite: string;
  runs: HeatmapRun[];
};

export type SelectedCell = {
  rowIndex: number;
  runIndex: number;
};

export type SeverityFilter =
  | "all"
  | "improvements"
  | "stable"
  | "regressions"
  | "severe";

export const METRICS: Array<{
  key: MetricKey;
  label: string;
  unit: string;
  description: string;
}> = [
  {
    key: "runtimeDelta",
    label: "Runtime delta",
    unit: "%",
    description:
      "Highlights wall-clock runtime change versus the baseline run.",
  },
  {
    key: "instructionDelta",
    label: "Instruction delta",
    unit: "%",
    description:
      "Shows VM instruction growth that can indicate compute regressions before latency spikes.",
  },
  {
    key: "memoryDelta",
    label: "Memory delta",
    unit: "%",
    description:
      "Tracks memory pressure changes across repeated contract executions.",
  },
];

export const HEATMAP_ROWS: ContractHeatmapRow[] = [
  {
    contract: "amm-pool",
    suite: "Swap path benchmarks",
    runs: [
      {
        id: "run-1842",
        label: "Baseline",
        commit: "a81c3d2",
        runtimeDelta: 0,
        instructionDelta: 0,
        memoryDelta: 0,
      },
      {
        id: "run-1848",
        label: "Fee math",
        commit: "d32f118",
        runtimeDelta: 12,
        instructionDelta: 9,
        memoryDelta: 3,
      },
      {
        id: "run-1851",
        label: "Routing",
        commit: "c41aa8e",
        runtimeDelta: 28,
        instructionDelta: 16,
        memoryDelta: 5,
      },
      {
        id: "run-1860",
        label: "Stabilized",
        commit: "9e8ff44",
        runtimeDelta: 7,
        instructionDelta: 4,
        memoryDelta: -2,
      },
    ],
  },
  {
    contract: "vault",
    suite: "Rebalance benchmarks",
    runs: [
      {
        id: "run-1842",
        label: "Baseline",
        commit: "a81c3d2",
        runtimeDelta: 0,
        instructionDelta: 0,
        memoryDelta: 0,
      },
      {
        id: "run-1848",
        label: "Fee math",
        commit: "d32f118",
        runtimeDelta: -6,
        instructionDelta: -4,
        memoryDelta: 2,
      },
      {
        id: "run-1851",
        label: "Routing",
        commit: "c41aa8e",
        runtimeDelta: 8,
        instructionDelta: 11,
        memoryDelta: 6,
      },
      {
        id: "run-1860",
        label: "Stabilized",
        commit: "9e8ff44",
        runtimeDelta: 18,
        instructionDelta: 14,
        memoryDelta: 10,
      },
    ],
  },
  {
    contract: "streaming-payments",
    suite: "Settlement benchmarks",
    runs: [
      {
        id: "run-1842",
        label: "Baseline",
        commit: "a81c3d2",
        runtimeDelta: 0,
        instructionDelta: 0,
        memoryDelta: 0,
      },
      {
        id: "run-1848",
        label: "Fee math",
        commit: "d32f118",
        runtimeDelta: 5,
        instructionDelta: 3,
        memoryDelta: 1,
      },
      {
        id: "run-1851",
        label: "Routing",
        commit: "c41aa8e",
        runtimeDelta: 21,
        instructionDelta: 18,
        memoryDelta: 14,
      },
      {
        id: "run-1860",
        label: "Stabilized",
        commit: "9e8ff44",
        runtimeDelta: -4,
        instructionDelta: -8,
        memoryDelta: -3,
      },
    ],
  },
  {
    contract: "governor",
    suite: "Proposal execution",
    runs: [
      {
        id: "run-1842",
        label: "Baseline",
        commit: "a81c3d2",
        runtimeDelta: 0,
        instructionDelta: 0,
        memoryDelta: 0,
      },
      {
        id: "run-1848",
        label: "Fee math",
        commit: "d32f118",
        runtimeDelta: 14,
        instructionDelta: 10,
        memoryDelta: 4,
      },
      {
        id: "run-1851",
        label: "Routing",
        commit: "c41aa8e",
        runtimeDelta: 31,
        instructionDelta: 22,
        memoryDelta: 16,
      },
      {
        id: "run-1860",
        label: "Stabilized",
        commit: "9e8ff44",
        runtimeDelta: 11,
        instructionDelta: 5,
        memoryDelta: 2,
      },
    ],
  },
];

export const LEGEND_ITEMS: Array<{
  key: SeverityFilter;
  label: string;
  range: string;
  className: string;
}> = [
  {
    key: "improvements",
    label: "Improvement",
    range: "Below 0%",
    className: "bg-emerald-100 text-emerald-900 border-emerald-200",
  },
  {
    key: "stable",
    label: "Stable",
    range: "0% to 5%",
    className: "bg-amber-100 text-amber-950 border-amber-200",
  },
  {
    key: "regressions",
    label: "Regression",
    range: "6% to 20%",
    className: "bg-orange-200 text-orange-950 border-orange-300",
  },
  {
    key: "severe",
    label: "Severe regression",
    range: "Above 20%",
    className: "bg-rose-700 text-white border-rose-700",
  },
];

export const getHeatClassName = (value: number): string => {
  if (value < 0) return "bg-emerald-100 text-emerald-900 border-emerald-200";
  if (value <= 5) return "bg-amber-100 text-amber-950 border-amber-200";
  if (value <= 20) return "bg-orange-200 text-orange-950 border-orange-300";
  return "bg-rose-700 text-white border-rose-700";
};

export const getSeverityFilter = (value: number): SeverityFilter => {
  if (value < 0) return "improvements";
  if (value <= 5) return "stable";
  if (value <= 20) return "regressions";
  return "severe";
};

export const formatDelta = (value: number): string =>
  `${value > 0 ? "+" : ""}${value}%`;

export const getAnnouncement = (value: number): string => {
  if (value < 0) return "Performance improved against baseline.";
  if (value <= 5) return "Performance stayed within the stable range.";
  if (value <= 20) return "Performance regression needs follow-up.";
  return "Severe regression detected and should be investigated first.";
};

export const getCellId = (rowIndex: number, runIndex: number) =>
  `heatmap-cell-${rowIndex}-${runIndex}`;

export const normalizeCell = (
  rows: ContractHeatmapRow[],
  desiredCell: SelectedCell,
  metric: MetricKey,
  severityFilter: SeverityFilter,
): SelectedCell => {
  if (rows.length === 0) {
    return { rowIndex: 0, runIndex: 0 };
  }

  const nextRowIndex = Math.min(
    Math.max(desiredCell.rowIndex, 0),
    rows.length - 1,
  );
  const nextRow = rows[nextRowIndex] ?? rows[0];
  const nextRunIndex = Math.min(
    Math.max(desiredCell.runIndex, 0),
    nextRow.runs.length - 1,
  );
  const nextRun = nextRow.runs[nextRunIndex];

  if (
    severityFilter === "all" ||
    getSeverityFilter(nextRun[metric]) === severityFilter
  ) {
    return { rowIndex: nextRowIndex, runIndex: nextRunIndex };
  }

  const fallbackRowIndex = rows.findIndex((row) =>
    row.runs.some((run) => getSeverityFilter(run[metric]) === severityFilter),
  );
  const resolvedRowIndex = fallbackRowIndex >= 0 ? fallbackRowIndex : 0;
  const fallbackRunIndex = rows[resolvedRowIndex]?.runs.findIndex(
    (run) => getSeverityFilter(run[metric]) === severityFilter,
  );

  return {
    rowIndex: resolvedRowIndex,
    runIndex:
      fallbackRunIndex !== undefined && fallbackRunIndex >= 0
        ? fallbackRunIndex
        : 0,
  };
};

export default function AddHeatmapInteractions() {
  const [metric, setMetric] = useState<MetricKey>("runtimeDelta");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [activeCell, setActiveCell] = useState<SelectedCell>({
    rowIndex: 0,
    runIndex: 2,
  });
  const [pinnedCell, setPinnedCell] = useState<SelectedCell | null>({
    rowIndex: 0,
    runIndex: 2,
  });
  const [dataState, setDataState] = useState<"loading" | "error" | "success">(
    "loading",
  );
  const [fetchAttempt, setFetchAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDataState("loading");
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (Math.random() < 0.1) {
        setDataState("error");
      } else {
        setDataState("success");
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchAttempt]);

  const filteredRows = useMemo(() => {
    return HEATMAP_ROWS.filter((row) => {
      if (contractFilter !== "all" && row.contract !== contractFilter) {
        return false;
      }

      if (severityFilter === "all") {
        return true;
      }

      return row.runs.some(
        (run) => getSeverityFilter(run[metric]) === severityFilter,
      );
    });
  }, [contractFilter, metric, severityFilter]);

  const normalizedActiveCell = useMemo(
    () => normalizeCell(filteredRows, activeCell, metric, severityFilter),
    [activeCell, filteredRows, metric, severityFilter],
  );
  const normalizedPinnedCell = useMemo(
    () =>
      pinnedCell
        ? normalizeCell(filteredRows, pinnedCell, metric, severityFilter)
        : null,
    [filteredRows, metric, pinnedCell, severityFilter],
  );

  const displayCell = normalizedPinnedCell ?? normalizedActiveCell;
  const selectedRow = filteredRows[displayCell.rowIndex] ?? filteredRows[0];
  const selectedRun =
    selectedRow?.runs[displayCell.runIndex] ?? selectedRow?.runs[0];
  const selectedMetric =
    METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const selectedValue = selectedRun ? selectedRun[metric] : 0;

  const summary = useMemo(() => {
    const values = filteredRows.flatMap((row) =>
      row.runs
        .map((run) => run[metric])
        .filter(
          (value) =>
            severityFilter === "all" ||
            getSeverityFilter(value) === severityFilter,
        ),
    );

    return {
      total: values.length,
      regressions: values.filter((value) => value > 5).length,
      severe: values.filter((value) => value > 20).length,
      improvements: values.filter((value) => value < 0).length,
    };
  }, [filteredRows, metric, severityFilter]);

  const runHeaders = HEATMAP_ROWS[0]?.runs ?? [];

  const moveSelection = (
    currentRowIndex: number,
    currentRunIndex: number,
    rowDelta: number,
    runDelta: number,
  ) => {
    if (filteredRows.length === 0) {
      return;
    }

    const nextRowIndex = Math.min(
      Math.max(currentRowIndex + rowDelta, 0),
      filteredRows.length - 1,
    );
    const nextRunIndex = Math.min(
      Math.max(currentRunIndex + runDelta, 0),
      (filteredRows[nextRowIndex]?.runs.length ?? 1) - 1,
    );
    const nextCell = { rowIndex: nextRowIndex, runIndex: nextRunIndex };

    setActiveCell(nextCell);
    if (normalizedPinnedCell) {
      setPinnedCell(nextCell);
    }

    if (typeof document !== "undefined") {
      document.getElementById(getCellId(nextRowIndex, nextRunIndex))?.focus();
    }
  };

  return (
    <section
      id="run-heatmap"
      aria-labelledby="run-heatmap-title"
      className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8"
    >
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-orange-600 dark:text-orange-300">
            Run Heatmap
          </p>
          <h2
            id="run-heatmap-title"
            className="text-3xl font-semibold tracking-tight md:text-4xl"
          >
            Interactive performance heatmap for the dashboard
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
            Compare benchmark shifts by metric, filter to the contracts or
            severities you care about, then use hover, click, or keyboard arrows
            to inspect each run in context.
          </p>
        </div>

        {dataState === "success" && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-4 text-sm dark:border-orange-900/60 dark:bg-orange-950/20 md:grid-cols-4">
            <div>
              <div className="font-semibold text-orange-950 dark:text-orange-100">
                {summary.total}
              </div>
              <div className="text-orange-800 dark:text-orange-300">
                Visible cells
              </div>
            </div>
            <div>
              <div className="font-semibold text-orange-950 dark:text-orange-100">
                {summary.regressions}
              </div>
              <div className="text-orange-800 dark:text-orange-300">
                Regressions above +5%
              </div>
            </div>
            <div>
              <div className="font-semibold text-orange-950 dark:text-orange-100">
                {summary.severe}
              </div>
              <div className="text-orange-800 dark:text-orange-300">
                Severe regressions
              </div>
            </div>
            <div>
              <div className="font-semibold text-orange-950 dark:text-orange-100">
                {summary.improvements}
              </div>
              <div className="text-orange-800 dark:text-orange-300">
                Improvements
              </div>
            </div>
          </div>
        )}
      </div>

      {dataState === "loading" && (
        <div
          className="space-y-4"
          role="status"
          aria-label="Loading heatmap data"
        >
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 w-32 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
              />
            ))}
          </div>
          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "220px repeat(4, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {dataState === "error" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-10 text-center dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-red-900 dark:text-red-100">
              Failed to load heatmap data
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              Check your connection and try again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFetchAttempt((n) => n + 1)}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-red-700 active:scale-95"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9"
              />
            </svg>
            Retry
          </button>
        </div>
      )}

      {dataState === "success" && (
        <>
          <div
            className="mb-6 flex flex-wrap gap-3"
            role="tablist"
            aria-label="Heatmap metric selector"
          >
            {METRICS.map((item) => {
              const isActive = item.key === metric;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setMetric(item.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mb-6 flex flex-col gap-3 rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Contracts
              </span>
              <button
                type="button"
                onClick={() => setContractFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  contractFilter === "all"
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                All contracts
              </button>
              {HEATMAP_ROWS.map((row) => (
                <button
                  key={row.contract}
                  type="button"
                  onClick={() => setContractFilter(row.contract)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    contractFilter === row.contract
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                  }`}
                >
                  {row.contract}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Severity
              </span>
              <button
                type="button"
                onClick={() => setSeverityFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  severityFilter === "all"
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                All ranges
              </button>
              {LEGEND_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSeverityFilter(item.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    severityFilter === item.key
                      ? `${item.className} shadow-sm`
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {(contractFilter !== "all" || severityFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setContractFilter("all");
                    setSeverityFilter("all");
                  }}
                  className="rounded-full border border-transparent px-3 py-1.5 text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <figure className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <figcaption className="mb-4 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedMetric.label}
                </span>
                <span>{selectedMetric.description}</span>
              </figcaption>

              {filteredRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                  No heatmap cells match the current filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div
                      className="grid gap-2"
                      style={{
                        gridTemplateColumns: `220px repeat(${runHeaders.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Contract
                      </div>
                      {runHeaders.map((run) => (
                        <div
                          key={run.id}
                          className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"
                        >
                          <div>{run.label}</div>
                          <div className="mt-1 text-[11px] normal-case tracking-normal text-zinc-400">
                            {run.commit}
                          </div>
                        </div>
                      ))}

                      {filteredRows.map((row, rowIndex) => (
                        <div key={row.contract} className="contents">
                          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {row.contract}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {row.suite}
                            </div>
                          </div>

                          {row.runs.map((run, runIndex) => {
                            const value = run[metric];
                            const severity = getSeverityFilter(value);
                            const isFilteredOut =
                              severityFilter !== "all" &&
                              severity !== severityFilter;
                            const isPinned =
                              normalizedPinnedCell?.rowIndex === rowIndex &&
                              normalizedPinnedCell?.runIndex === runIndex;
                            const isActive =
                              normalizedActiveCell.rowIndex === rowIndex &&
                              normalizedActiveCell.runIndex === runIndex;
                            const isSelected =
                              isPinned || (!normalizedPinnedCell && isActive);

                            return (
                              <button
                                key={`${row.contract}-${run.id}`}
                                id={getCellId(rowIndex, runIndex)}
                                type="button"
                                onClick={() => {
                                  setActiveCell({ rowIndex, runIndex });
                                  setPinnedCell((current) =>
                                    current?.rowIndex === rowIndex &&
                                    current?.runIndex === runIndex
                                      ? null
                                      : { rowIndex, runIndex },
                                  );
                                }}
                                onMouseEnter={() =>
                                  setActiveCell({ rowIndex, runIndex })
                                }
                                onFocus={() =>
                                  setActiveCell({ rowIndex, runIndex })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "ArrowRight") {
                                    event.preventDefault();
                                    moveSelection(rowIndex, runIndex, 0, 1);
                                  } else if (event.key === "ArrowLeft") {
                                    event.preventDefault();
                                    moveSelection(rowIndex, runIndex, 0, -1);
                                  } else if (event.key === "ArrowDown") {
                                    event.preventDefault();
                                    moveSelection(rowIndex, runIndex, 1, 0);
                                  } else if (event.key === "ArrowUp") {
                                    event.preventDefault();
                                    moveSelection(rowIndex, runIndex, -1, 0);
                                  } else if (event.key === "Escape") {
                                    setPinnedCell(null);
                                  }
                                }}
                                aria-pressed={isPinned}
                                aria-current={isSelected ? "true" : undefined}
                                aria-label={`${row.contract} ${run.label} ${selectedMetric.label} ${formatDelta(value)}${isPinned ? ", pinned" : ""}`}
                                className={`min-h-24 rounded-2xl border px-3 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${getHeatClassName(
                                  value,
                                )} ${isSelected ? "ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-zinc-950" : ""} ${
                                  isFilteredOut
                                    ? "opacity-35"
                                    : "hover:-translate-y-0.5"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.15em] opacity-80">
                                    {run.id}
                                  </div>
                                  {isPinned && (
                                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]">
                                      pinned
                                    </span>
                                  )}
                                </div>
                                <div className="mt-4 text-2xl font-semibold">
                                  {formatDelta(value)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </figure>

            <aside className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="mb-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      {pinnedCell ? "Pinned cell" : "Active cell"}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                      {selectedRow?.contract ?? "No selection"}
                    </h3>
                  </div>
                  {pinnedCell && (
                    <button
                      type="button"
                      onClick={() => setPinnedCell(null)}
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-50"
                    >
                      Unpin
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedRow?.suite ??
                    "Choose a visible cell to inspect the run."}
                </p>
              </div>

              <dl className="space-y-4 text-sm">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <dt className="text-zinc-500 dark:text-zinc-400">Run</dt>
                  <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {selectedRun ? (
                      <>
                        {selectedRun.label}{" "}
                        <span className="text-zinc-500 dark:text-zinc-400">
                          ({selectedRun.id})
                        </span>
                      </>
                    ) : (
                      "None"
                    )}
                  </dd>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <dt className="text-zinc-500 dark:text-zinc-400">Commit</dt>
                  <dd className="mt-1 font-mono text-zinc-900 dark:text-zinc-100">
                    {selectedRun?.commit ?? "N/A"}
                  </dd>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    {selectedMetric.label}
                  </dt>
                  <dd className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {formatDelta(selectedValue)}
                  </dd>
                  <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {getAnnouncement(selectedValue)}
                  </p>
                </div>
              </dl>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Interaction tips
                </h4>
                <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>Hover or focus a cell to preview its details.</li>
                  <li>
                    Click a cell to pin it while you change filters or metrics.
                  </li>
                  <li>
                    Use arrow keys to move across the heatmap and{" "}
                    <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] dark:border-zinc-700">
                      Esc
                    </kbd>{" "}
                    to unpin.
                  </li>
                </ul>
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Legend
                </h4>
                <ul className="mt-3 space-y-2" aria-label="Heatmap legend">
                  {LEGEND_ITEMS.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() =>
                          setSeverityFilter((current) =>
                            current === item.key ? "all" : item.key,
                          )
                        }
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                          severityFilter === item.key
                            ? "border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30"
                            : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex h-4 w-4 rounded-sm border ${item.className}`}
                            aria-hidden="true"
                          />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {item.range}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
