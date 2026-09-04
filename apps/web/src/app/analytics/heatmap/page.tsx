'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MetricKey,
  SelectedCell,
  METRICS,
  HEATMAP_ROWS,
  LEGEND_ITEMS,
  getHeatClassName,
  formatDelta,
  getCellId,
} from '../../add-heatmap-interactions';

export default function HeatmapPage() {
  const [metric, setMetric] = useState<MetricKey>('runtimeDelta');
  const [activeCell, setActiveCell] = useState<SelectedCell | null>(null);
  const [pinnedCell, setPinnedCell] = useState<SelectedCell | null>(null);

  const displayCell = pinnedCell ?? activeCell;
  const selectedRow = displayCell ? HEATMAP_ROWS[displayCell.rowIndex] : null;
  const selectedRun = selectedRow?.runs[displayCell?.runIndex ?? 0] ?? null;
  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const summary = useMemo(() => {
    const values = HEATMAP_ROWS.flatMap((row) => row.runs.map((run) => run[metric]));
    return {
      total: values.length,
      regressions: values.filter((v) => v > 5).length,
      severe: values.filter((v) => v > 20).length,
      improvements: values.filter((v) => v < 0).length,
    };
  }, [metric]);

  const runHeaders = HEATMAP_ROWS[0]?.runs ?? [];

  const moveSelection = (
    currentRowIndex: number,
    currentRunIndex: number,
    rowDelta: number,
    runDelta: number,
  ) => {
    const nextRowIndex = Math.min(
      Math.max(currentRowIndex + rowDelta, 0),
      HEATMAP_ROWS.length - 1,
    );
    const nextRunIndex = Math.min(
      Math.max(currentRunIndex + runDelta, 0),
      (HEATMAP_ROWS[nextRowIndex]?.runs.length ?? 1) - 1,
    );
    const nextCell = { rowIndex: nextRowIndex, runIndex: nextRunIndex };

    setActiveCell(nextCell);
    if (pinnedCell) {
      setPinnedCell(nextCell);
    }

    if (typeof document !== 'undefined') {
      document.getElementById(getCellId(nextRowIndex, nextRunIndex))?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-4 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Run Performance Heatmap
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl">
            Compare benchmark shifts by metric across contracts. Use the toggle to switch
            between runtime, instruction, and memory deltas. Hover or click cells to inspect
            individual runs.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-4 text-sm dark:border-orange-900/60 dark:bg-orange-950/20 md:grid-cols-4">
          <div>
            <div className="font-semibold text-orange-950 dark:text-orange-100">
              {summary.total}
            </div>
            <div className="text-orange-800 dark:text-orange-300">Total cells</div>
          </div>
          <div>
            <div className="font-semibold text-orange-950 dark:text-orange-100">
              {summary.regressions}
            </div>
            <div className="text-orange-800 dark:text-orange-300">Regressions above +5%</div>
          </div>
          <div>
            <div className="font-semibold text-orange-950 dark:text-orange-100">
              {summary.severe}
            </div>
            <div className="text-orange-800 dark:text-orange-300">Severe regressions</div>
          </div>
          <div>
            <div className="font-semibold text-orange-950 dark:text-orange-100">
              {summary.improvements}
            </div>
            <div className="text-orange-800 dark:text-orange-300">Improvements</div>
          </div>
        </div>

        {/* Metric Toggle */}
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
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-orange-300 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-orange-800 dark:hover:text-orange-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Heatmap Grid */}
          <figure className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <figcaption className="mb-4 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedMetric.label}
              </span>
              <span>{selectedMetric.description}</span>
            </figcaption>

            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `220px repeat(${runHeaders.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Header Row */}
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

                  {/* Data Rows */}
                  {HEATMAP_ROWS.map((row, rowIndex) => (
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
                        const isPinned =
                          pinnedCell?.rowIndex === rowIndex &&
                          pinnedCell?.runIndex === runIndex;
                        const isActive =
                          activeCell?.rowIndex === rowIndex &&
                          activeCell?.runIndex === runIndex;
                        const isSelected = isPinned || (!pinnedCell && isActive);

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
                            onMouseEnter={() => setActiveCell({ rowIndex, runIndex })}
                            onFocus={() => setActiveCell({ rowIndex, runIndex })}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowRight') {
                                event.preventDefault();
                                moveSelection(rowIndex, runIndex, 0, 1);
                              } else if (event.key === 'ArrowLeft') {
                                event.preventDefault();
                                moveSelection(rowIndex, runIndex, 0, -1);
                              } else if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                moveSelection(rowIndex, runIndex, 1, 0);
                              } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                moveSelection(rowIndex, runIndex, -1, 0);
                              } else if (event.key === 'Escape') {
                                setPinnedCell(null);
                              }
                            }}
                            aria-pressed={isPinned}
                            aria-current={isSelected ? 'true' : undefined}
                            aria-label={`${row.contract} ${run.label} ${selectedMetric.label} ${formatDelta(value)}${isPinned ? ', pinned' : ''}`}
                            className={`min-h-24 rounded-2xl border px-3 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${getHeatClassName(value)} ${
                              isSelected
                                ? 'ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-zinc-950'
                                : 'hover:-translate-y-0.5'
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

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-3 uppercase tracking-wider">
                Performance Legend
              </h4>
              <div className="flex flex-wrap gap-3 text-xs">
                {LEGEND_ITEMS.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border ${item.className}`} />
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {item.label} ({item.range})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </figure>

          {/* Detail Sidebar */}
          <aside className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    {pinnedCell ? 'Pinned cell' : 'Active cell'}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {selectedRow?.contract ?? 'No selection'}
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
                {selectedRow?.suite ?? 'Hover or click a cell to inspect the run.'}
              </p>
            </div>

            <dl className="space-y-4 text-sm">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">Run</dt>
                <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedRun ? (
                    <>
                      {selectedRun.label}{' '}
                      <span className="text-zinc-500 dark:text-zinc-400">
                        ({selectedRun.id})
                      </span>
                    </>
                  ) : (
                    'None'
                  )}
                </dd>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">Commit</dt>
                <dd className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                  {selectedRun?.commit ?? '—'}
                </dd>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">{selectedMetric.label}</dt>
                <dd className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedRun ? formatDelta(selectedRun[metric]) : '—'}
                </dd>
              </div>

              {selectedRun && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <dt className="text-zinc-500 dark:text-zinc-400 mb-2">All Metrics</dt>
                  <dd className="space-y-2">
                    {METRICS.map((m) => (
                      <div key={m.key} className="flex justify-between">
                        <span className="text-zinc-600 dark:text-zinc-400">{m.label}</span>
                        <span
                          className={`font-medium ${
                            m.key === metric
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          {formatDelta(selectedRun[m.key])}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
