'use client';

import { useState, useMemo } from 'react';
import type { FuzzingRun } from './types';

interface RunComparisonProps {
  runs: FuzzingRun[];
}

const METRICS = [
  { key: 'duration' as const, label: 'Duration', format: (v: number) => `${Math.round(v / 1000)}s` },
  { key: 'cpuInstructions' as const, label: 'CPU Instructions', format: (v: number) => v.toLocaleString() },
  { key: 'memoryBytes' as const, label: 'Memory', format: (v: number) => v < 1024 * 1024 ? `${(v / 1024).toFixed(1)} KB` : `${(v / (1024 * 1024)).toFixed(1)} MB` },
  { key: 'minResourceFee' as const, label: 'Min Resource Fee', format: (v: number) => `${v.toLocaleString()} stroops` },
  { key: 'seedCount' as const, label: 'Seed Count', format: (v: number) => v.toLocaleString() },
];

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function AddRunComparison({ runs }: RunComparisonProps) {
  const [runA, setRunA] = useState<FuzzingRun | null>(null);
  const [runB, setRunB] = useState<FuzzingRun | null>(null);

  const completedRuns = useMemo(() => runs.filter(run => run.status === 'completed'), [runs]);

  const comparison = useMemo(() => {
    if (!runA || !runB) return null;

    return METRICS.map(metric => {
      const valueA = runA[metric.key];
      const valueB = runB[metric.key];
      const delta = valueA === 0 ? 0 : ((valueB - valueA) / valueA) * 100;
      const isImprovement = delta < 0;
      const isSignificant = Math.abs(delta) >= 10;

      return {
        ...metric,
        valueA,
        valueB,
        delta,
        isImprovement,
        isSignificant,
      };
    });
  }, [runA, runB]);

  const getDeltaColor = (delta: number) => {
    if (delta > 10) return 'text-red-600 dark:text-red-400';
    if (delta < -10) return 'text-green-600 dark:text-green-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getDeltaBadge = (delta: number) => {
    if (delta > 10) return 'Regression';
    if (delta < -10) return 'Improvement';
    return 'Stable';
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">
          Run Comparison
        </p>
        <h2 className="text-2xl font-bold tracking-tight">
          Compare Two Fuzzing Runs
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select two completed runs to compare their performance metrics and identify regressions or improvements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Run A Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Run A (Baseline)
          </label>
          <select
            value={runA?.id || ''}
            onChange={(e) => {
              const selected = completedRuns.find(r => r.id === e.target.value);
              setRunA(selected || null);
            }}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="">Select a run...</option>
            {completedRuns.map(run => (
              <option key={run.id} value={run.id}>
                {run.id} - {run.area} ({run.severity})
              </option>
            ))}
          </select>
          {runA && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm">{runA.id}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[runA.status]}`}>
                  {runA.status}
                </span>
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Area: {runA.area} | Severity: {runA.severity}
              </div>
            </div>
          )}
        </div>

        {/* Run B Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Run B (Comparison)
          </label>
          <select
            value={runB?.id || ''}
            onChange={(e) => {
              const selected = completedRuns.find(r => r.id === e.target.value);
              setRunB(selected || null);
            }}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="">Select a run...</option>
            {completedRuns.map(run => (
              <option key={run.id} value={run.id}>
                {run.id} - {run.area} ({run.severity})
              </option>
            ))}
          </select>
          {runB && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm">{runB.id}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[runB.status]}`}>
                  {runB.status}
                </span>
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Area: {runB.area} | Severity: {runB.severity}
              </div>
            </div>
          )}
        </div>
      </div>

      {comparison ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Comparison Results</h3>
          <div className="grid gap-4">
            {comparison.map(metric => (
              <div key={metric.key} className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{metric.label}</span>
                  <span className={`text-sm font-bold ${getDeltaColor(metric.delta)}`}>
                    {metric.delta > 0 ? '+' : ''}{metric.delta.toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-zinc-600 dark:text-zinc-400 mb-1">Run A</div>
                    <div className="font-mono text-zinc-900 dark:text-zinc-100">{metric.format(metric.valueA)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600 dark:text-zinc-400 mb-1">Run B</div>
                    <div className="font-mono text-zinc-900 dark:text-zinc-100">{metric.format(metric.valueB)}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {getDeltaBadge(metric.delta)}
                  </div>
                  {metric.isSignificant && (
                    <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                      metric.isImprovement
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {metric.isImprovement ? '↓ Improvement' : '↑ Regression'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">Select two runs to compare their metrics</p>
        </div>
      )}
    </section>
  );
}
