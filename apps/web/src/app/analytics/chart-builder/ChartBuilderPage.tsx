'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FuzzingRun } from '../../types';
import { fetchRuns } from '../../../lib/api-client';
import {
  validateChartConfig,
  saveCustomChart,
  loadCustomCharts,
  deleteCustomChart,
  type ChartConfig,
  type ChartType,
  type MetricKey,
  type DimensionKey,
  type SavedCustomChart,
} from './chart-builder-dsl';
import ChartPreview from './ChartPreview';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'duration', label: 'Duration' },
  { key: 'cpuInstructions', label: 'CPU Instructions' },
  { key: 'memoryBytes', label: 'Memory' },
  { key: 'minResourceFee', label: 'Min Resource Fee' },
  { key: 'seedCount', label: 'Seed Count' },
];

const DIMENSION_OPTIONS: { key: DimensionKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'area', label: 'Area' },
  { key: 'severity', label: 'Severity' },
  { key: 'day', label: 'Day' },
];

const CHART_TYPE_OPTIONS: { key: ChartType; label: string; desc: string }[] = [
  { key: 'bar', label: 'Bar', desc: 'Compare metric values across groups' },
  { key: 'line', label: 'Line', desc: 'Show trends over ordered categories' },
  { key: 'scatter', label: 'Scatter', desc: 'Plot two metrics against each other' },
  { key: 'pie', label: 'Pie', desc: 'Show part-to-whole for a single metric' },
];

export default function ChartBuilderPage() {
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Partial<ChartConfig>>({
    dataset: 'runs',
    metrics: ['duration'],
    type: 'bar',
  });
  const [savedCharts, setSavedCharts] = useState<SavedCustomChart[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((data) => {
        if (!cancelled) {
          setRuns(data.runs ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate saved charts from localStorage once */
    setSavedCharts(loadCustomCharts());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const updateConfig = useCallback((patch: Partial<ChartConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleMetric = useCallback((metric: MetricKey) => {
    setConfig((prev) => {
      const current = prev.metrics ?? [];
      const next = current.includes(metric)
        ? current.filter((m) => m !== metric)
        : [...current, metric];
      return { ...prev, metrics: next.length > 0 ? next : [metric] };
    });
  }, []);

  const handleSave = useCallback(() => {
    const result = validateChartConfig(config);
    if (!result.ok) return;
    const saved = saveCustomChart(result.config);
    setSavedCharts(loadCustomCharts());
    setSaveMessage(`Chart saved as "${saved.title ?? saved.id}"`);
    setTimeout(() => setSaveMessage(null), 3000);
  }, [config]);

  const handleDelete = useCallback((chartId: string) => {
    deleteCustomChart(chartId);
    setSavedCharts(loadCustomCharts());
  }, []);

  const validation = useMemo(() => validateChartConfig(config), [config]);

  return (
    <div className="px-6 md:px-8 max-w-6xl mx-auto w-full py-14">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/analytics" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition">
            ← Analytics
          </Link>
        </div>
        <h1 className="text-3xl font-bold">Custom Chart Builder</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          Configure metrics, dimensions, and chart type to build custom visualizations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <h2 className="font-semibold mb-4">Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Chart Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CHART_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => updateConfig({ type: opt.key })}
                      className={`px-3 py-2 text-sm rounded-lg border transition ${
                        config.type === opt.key
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                          : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Metrics
                </label>
                <div className="space-y-1.5">
                  {METRIC_OPTIONS.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={(config.metrics ?? []).includes(opt.key)}
                        onChange={() => toggleMetric(opt.key)}
                        className="rounded border-zinc-300 dark:border-zinc-600"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Dimension (Group By)
                </label>
                <select
                  value={config.dimension ?? ''}
                  onChange={(e) => updateConfig({ dimension: e.target.value as DimensionKey || undefined })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                >
                  <option value="">None (aggregate)</option>
                  {DIMENSION_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={config.title ?? ''}
                  onChange={(e) => updateConfig({ title: e.target.value || undefined })}
                  placeholder="Optional chart title"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {!validation.ok && (
              <div className="mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                {validation.errors.map((err, i) => (
                  <div key={i} className="text-red-600 dark:text-red-400 text-xs">
                    {err.message}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={!validation.ok}
              className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
            >
              Save Chart
            </button>

            {saveMessage && (
              <div className="mt-2 text-green-600 dark:text-green-400 text-xs text-center">
                {saveMessage}
              </div>
            )}
          </div>

          {savedCharts.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
              <h2 className="font-semibold mb-3">Saved Charts</h2>
              <div className="space-y-2">
                {savedCharts.map((chart) => (
                  <div
                    key={chart.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="text-sm truncate">
                      {chart.title ?? chart.id}
                    </div>
                    <button
                      onClick={() => handleDelete(chart.id)}
                      className="text-zinc-400 hover:text-red-500 text-xs ml-2 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 text-center">
              <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading run data...</div>
            </div>
          ) : (
            <ChartPreview config={config} runs={runs} />
          )}
        </div>
      </div>
    </div>
  );
}
