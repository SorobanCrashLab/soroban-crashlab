'use client';

import { useMemo } from 'react';
import { FuzzingRun, RunArea, RunSeverity } from './types';

interface RunHeatmapProps {
  runs: FuzzingRun[];
  metric?: 'duration' | 'cpu' | 'memory' | 'fee';
  title?: string;
}

export default function RunHeatmap({
  runs,
  metric = 'duration',
  title = 'Run Performance Heatmap'
}: RunHeatmapProps) {
  const { heatmapData, minValue, maxValue, stats } = useMemo(() => {
    if (runs.length === 0) {
      return { heatmapData: [], minValue: 0, maxValue: 0, stats: null };
    }

    let values: number[] = [];
    let extractValue = (r: FuzzingRun) => 0;

    switch (metric) {
      case 'cpu':
        values = runs.map(r => r.cpuInstructions);
        extractValue = r => r.cpuInstructions;
        break;
      case 'memory':
        values = runs.map(r => r.memoryBytes);
        extractValue = r => r.memoryBytes;
        break;
      case 'fee':
        values = runs.map(r => r.minResourceFee);
        extractValue = r => r.minResourceFee;
        break;
      case 'duration':
      default:
        values = runs.map(r => r.duration);
        extractValue = r => r.duration;
        break;
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    const heatmapData = runs.map(run => ({
      id: run.id,
      area: run.area,
      severity: run.severity,
      value: extractValue(run),
      normalized: (extractValue(run) - minValue) / range,
      status: run.status,
    }));

    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const medianValue = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

    return {
      heatmapData,
      minValue,
      maxValue,
      stats: { avg: avgValue, median: medianValue, count: values.length }
    };
  }, [runs, metric]);

  const getHeatmapColor = (normalized: number, severity: RunSeverity) => {
    const baseHue = severity === 'critical' ? 0 : severity === 'high' ? 30 : severity === 'medium' ? 45 : 120;
    const saturation = Math.round(50 + (normalized * 50));
    const lightness = Math.round(70 - (normalized * 30));
    return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
  };

  const formatValue = (value: number) => {
    switch (metric) {
      case 'cpu':
        return `${(value / 1_000_000).toFixed(1)}M instructions`;
      case 'memory':
        return `${(value / 1_000_000).toFixed(1)}MB`;
      case 'fee':
        return `${value.toLocaleString()} stroops`;
      case 'duration':
      default:
        const seconds = Math.floor(value / 1000);
        const minutes = Math.floor(seconds / 60);
        return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
    }
  };

  const metricLabel = {
    duration: 'Duration',
    cpu: 'CPU Instructions',
    memory: 'Memory Usage',
    fee: 'Min Resource Fee'
  }[metric];

  const groupedByArea = useMemo(() => {
    const groups: Map<RunArea, Array<typeof heatmapData[number]>> = new Map();
    heatmapData.forEach(item => {
      if (!groups.has(item.area)) {
        groups.set(item.area, []);
      }
      groups.get(item.area)!.push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [heatmapData]);

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl p-6 shadow-sm w-full">
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Visualizing {metricLabel.toLowerCase()} across {runs.length} runs, grouped by area
        </p>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-900/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Min</p>
            <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {formatValue(minValue)}
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-900/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Average</p>
            <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {formatValue(stats.avg)}
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50 dark:bg-zinc-900/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Max</p>
            <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {formatValue(maxValue)}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {groupedByArea.map(([area, items]) => (
          <div key={area}>
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              {area}
            </h3>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  title={`${item.id}: ${formatValue(item.value)}`}
                  className="group relative h-8 rounded cursor-help transition-transform hover:scale-110"
                  style={{
                    backgroundColor: getHeatmapColor(item.normalized, item.severity),
                  }}
                >
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    <p className="font-semibold">{item.id}</p>
                    <p>{formatValue(item.value)}</p>
                    <p className="capitalize text-[10px]">{item.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-3 uppercase tracking-wider">
          Severity Legend
        </h4>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {(['low', 'medium', 'high', 'critical'] as RunSeverity[]).map((severity) => (
            <div key={severity} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getHeatmapColor(0.5, severity) }}
              />
              <span className="capitalize text-zinc-700 dark:text-zinc-300">{severity}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
