'use client';

import React, { useMemo } from 'react';
import type { FuzzingRun } from '../../types';
import type { ChartConfig } from './chart-builder-dsl';
import { validateChartConfig } from './chart-builder-dsl';
import {
  compileChartConfig,
} from './chart-transform-compiler';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const PALETTE = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

interface ChartPreviewProps {
  config: Partial<ChartConfig>;
  runs: FuzzingRun[];
}

export default function ChartPreview({ config, runs }: ChartPreviewProps) {
  const validation = useMemo(() => validateChartConfig(config), [config]);
  const compiled = useMemo(() => {
    if (!validation.ok) return null;
    return compileChartConfig(validation.config, runs);
  }, [validation, runs]);

  if (!validation.ok) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 text-center">
        <div className="text-zinc-400 dark:text-zinc-500 text-sm">
          Fix configuration errors to see preview
        </div>
        <ul className="mt-2 space-y-1">
          {validation.errors.map((err, i) => (
            <li key={i} className="text-red-500 dark:text-red-400 text-xs">
              {err.path.join('.')}: {err.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!compiled) return null;

  if (compiled.data.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 text-center">
        <div className="text-zinc-400 dark:text-zinc-500 text-sm">
          No data matches the current filters
        </div>
      </div>
    );
  }

  const { type, metrics } = validation.config;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      {compiled.rowCapHit && (
        <div className="mb-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          Dataset truncated to 5,000 rows for performance. Narrow filters to see all data.
        </div>
      )}

      <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
        {compiled.data.length} data point{compiled.data.length !== 1 ? 's' : ''}
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={compiled.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#f9fafb',
                  fontSize: 12,
                }}
              />
              <Legend />
              {metrics.map((m, i) => (
                <Bar key={m} dataKey={m} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={compiled.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#f9fafb',
                  fontSize: 12,
                }}
              />
              <Legend />
              {metrics.map((m, i) => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          ) : type === 'scatter' ? (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={metrics.length >= 2 ? 'x' : metrics[0]} type="number" name={metrics[0]} tick={{ fontSize: 12 }} />
              <YAxis dataKey={metrics.length >= 2 ? 'y' : (metrics[1] ?? metrics[0])} type="number" name={metrics[1] ?? metrics[0]} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#f9fafb',
                  fontSize: 12,
                }}
              />
              <Scatter
                name={metrics[0]}
                data={compiled.data}
                fill={PALETTE[0]}
              />
            </ScatterChart>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
              Pie charts coming soon
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
