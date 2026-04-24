'use client';

import { useMemo, useState } from 'react';
import type { FuzzingRun } from './types';
import {
  type ChartsDataState,
  type ComparisonMetric,
  buildChartRows,
  getChartsStateMessage,
  selectChartRuns,
  summarizeChartRows,
} from './add-run-comparison-charts-utils';

type ComparisonProps = {
  runs: FuzzingRun[];
  dataState: ChartsDataState;
  onRetry: () => void;
};

const METRICS: Array<{
  key: ComparisonMetric;
  label: string;
  description: string;
  formatter: (value: number) => string;
}> = [
  {
    key: 'duration',
    label: 'Duration',
    description: 'Total runtime for each run, useful for spotting regressions in end-to-end execution time.',
    formatter: (value) => `${Math.round(value / 1000)}s`,
  },
  {
    key: 'cpuInstructions',
    label: 'CPU instructions',
    description: 'Instruction count compared against the selected baseline run.',
    formatter: (value) => value.toLocaleString(),
  },
  {
    key: 'memoryBytes',
    label: 'Memory',
    description: 'Peak memory footprint to surface runs that are trending toward budget pressure.',
    formatter: (value) => {
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    },
  },
  {
    key: 'minResourceFee',
    label: 'Min resource fee',
    description: 'Minimum observed fee requirement, which helps compare cost drift across runs.',
    formatter: (value) => `${value.toLocaleString()} stroops`,
  },
];

const STATUS_STYLES: Record<FuzzingRun['status'], string> = {
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  failed: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
  running: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  cancelled: 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800',
};

const AREA_ACCENTS: Record<FuzzingRun['area'], string> = {
  auth: 'from-indigo-500 to-sky-400',
  state: 'from-emerald-500 to-teal-400',
  budget: 'from-amber-500 to-orange-400',
  xdr: 'from-fuchsia-500 to-pink-400',
};

const formatDelta = (value: number): string => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
};

const getDeltaTone = (delta: number): string => {
  if (delta <= -10) return 'text-emerald-700 dark:text-emerald-300';
  if (delta < 10) return 'text-zinc-700 dark:text-zinc-300';
  if (delta < 25) return 'text-orange-700 dark:text-orange-300';
  return 'text-rose-700 dark:text-rose-300';
};

const getDeltaBadge = (delta: number): string => {
  if (delta <= -10) return 'Improved';
  if (delta < 10) return 'Stable';
  if (delta < 25) return 'Watch';
  return 'Regression';
};

export default function AddRunComparisonCharts({ runs, dataState, onRetry }: ComparisonProps) {
  const [metric, setMetric] = useState<ComparisonMetric>('duration');
  const [baselineRunId, setBaselineRunId] = useState<string>('');
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const chartRuns = useMemo(() => selectChartRuns(runs), [runs]);
  const baselineRun = chartRuns.find((run) => run.id === baselineRunId) ?? chartRuns[chartRuns.length - 1] ?? null;
  const selectedRun = chartRuns.find((run) => run.id === selectedRunId) ?? chartRuns[0] ?? null;
  const metricConfig = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const stateMessage = getChartsStateMessage(dataState, chartRuns.length);

  const comparisonData = useMemo(() => {
    if (!baselineRun) return [];
    return buildChartRows(chartRuns, metric, baselineRun.id).map((row) => ({
      ...row,
      selected: selectedRun ? row.id === selectedRun.id : false,
    }));
  }, [baselineRun, chartRuns, metric, selectedRun]);

  const selectedComparison = comparisonData.find((entry) => entry.id === selectedRun?.id) ?? comparisonData[0];

  const summary = useMemo(() => summarizeChartRows(comparisonData), [comparisonData]);

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-600 dark:text-cyan-300">
            Run Comparison
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Compare runs side by side before digging into a single report
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
            Switch metrics, choose a baseline, and inspect deltas across recent runs to quickly separate routine variance from meaningful regressions.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 text-sm dark:border-cyan-900/60 dark:bg-cyan-950/20 md:grid-cols-4">
          <div>
            <div className="font-semibold text-cyan-950 dark:text-cyan-100">{summary.tracked}</div>
            <div className="text-cyan-800 dark:text-cyan-300">Visible runs</div>
          </div>
          <div>
            <div className="font-semibold text-cyan-950 dark:text-cyan-100">{summary.regressions}</div>
            <div className="text-cyan-800 dark:text-cyan-300">Regressions ≥ 10%</div>
          </div>
          <div>
            <div className="font-semibold text-cyan-950 dark:text-cyan-100">{summary.improvements}</div>
            <div className="text-cyan-800 dark:text-cyan-300">Improvements ≤ -10%</div>
          </div>
          <div>
            <div className="font-semibold text-cyan-950 dark:text-cyan-100">{summary.highestId}</div>
            <div className="text-cyan-800 dark:text-cyan-300">Highest current metric</div>
          </div>
        </div>
      </div>

      {dataState !== 'success' ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{stateMessage.title}</p>
          <p className="mt-2">{stateMessage.detail}</p>
          {dataState === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700"
            >
              Retry charts
            </button>
          )}
        </div>
      ) : chartRuns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{stateMessage.title}</p>
          <p className="mt-2">{stateMessage.detail}</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Comparison metric selector">
                {METRICS.map((item) => {
                  const isActive = item.key === metric;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`comparison-metric-${item.key}`}
                      onClick={() => setMetric(item.key)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                        event.preventDefault();
                        const currentIndex = METRICS.findIndex((candidate) => candidate.key === item.key);
                        const nextIndex =
                          event.key === 'ArrowRight'
                            ? (currentIndex + 1) % METRICS.length
                            : (currentIndex - 1 + METRICS.length) % METRICS.length;
                        setMetric(METRICS[nextIndex].key);
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'border-cyan-500 bg-cyan-500 text-white shadow-sm'
                          : 'border-zinc-300 bg-white text-zinc-700 hover:border-cyan-300 hover:text-cyan-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-cyan-800 dark:hover:text-cyan-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Baseline</span>
                  <select
                    value={baselineRun?.id ?? ''}
                    onChange={(event) => setBaselineRunId(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {chartRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id} · {run.area} · {run.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Highlight run</span>
                  <select
                    value={selectedRun?.id ?? ''}
                    onChange={(event) => setSelectedRunId(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {chartRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id} · {run.area} · {metricConfig.formatter(run[metric])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div
              id={`comparison-metric-${metric}`}
              className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{metricConfig.label}</div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{metricConfig.description}</p>
                </div>
                <div className="text-right text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Baseline: {baselineRun?.id ?? 'None'}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {comparisonData.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedRunId(entry.id)}
                  className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                    entry.selected
                      ? 'border-cyan-500 bg-cyan-50 shadow-sm dark:border-cyan-500 dark:bg-cyan-950/20'
                      : 'border-zinc-200 bg-white hover:border-cyan-300 dark:border-zinc-800 dark:bg-zinc-950'
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[entry.status]}`}>
                          {entry.status}
                        </span>
                        {entry.baseline && (
                          <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-800 dark:border-cyan-900/50 dark:bg-cyan-950/50 dark:text-cyan-300">
                            baseline
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {entry.area} · severity {entry.severity} · seeds {entry.seedCount.toLocaleString()}
                      </div>
                    </div>

                    <div className={`text-right text-sm font-semibold ${getDeltaTone(entry.delta)}`}>
                      {entry.baseline ? 'Reference run' : formatDelta(entry.delta)}
                      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">{getDeltaBadge(entry.delta)}</div>
                    </div>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${AREA_ACCENTS[entry.area]} transition-[width] duration-500`}
                      style={{ width: `${Math.max(entry.percentage, 6)}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">{metricConfig.formatter(entry.value)}</span>
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {entry.baseline ? 'Selected as baseline' : `vs ${baselineRun?.id ?? 'baseline'}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Selected comparison</p>
              <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {selectedComparison?.id ?? 'No run selected'}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {selectedComparison
                  ? `${selectedComparison.area} workload compared to baseline ${baselineRun?.id ?? 'N/A'}`
                  : 'Choose a run from the chart to inspect its comparison details.'}
              </p>
            </div>

            <dl className="space-y-4 text-sm">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">Current metric</dt>
                <dd className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {selectedComparison ? metricConfig.formatter(selectedComparison.value) : 'N/A'}
                </dd>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">Delta vs baseline</dt>
                <dd className={`mt-1 text-2xl font-semibold ${getDeltaTone(selectedComparison?.delta ?? 0)}`}>
                  {selectedComparison ? (selectedComparison.baseline ? '0%' : formatDelta(selectedComparison.delta)) : 'N/A'}
                </dd>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <dt className="text-zinc-500 dark:text-zinc-400">Baseline metric</dt>
                <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                  {baselineRun ? metricConfig.formatter(baselineRun[metric]) : 'N/A'}
                </dd>
              </div>
            </dl>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">How to use it</h4>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Pick the baseline run that represents expected behavior for the contract area you’re reviewing.</li>
                <li>Switch metrics to see whether a regression is runtime-bound, CPU-bound, memory-bound, or fee-bound.</li>
                <li>Click any bar card to focus it and compare its current value against the baseline in the detail panel.</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
