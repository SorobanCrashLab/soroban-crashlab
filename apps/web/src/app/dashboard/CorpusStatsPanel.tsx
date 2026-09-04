'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { CorpusStatPoint } from '../types';
import { downsampleCorpusStats } from '../../lib/utils/downsampler';

export interface CorpusStatsPanelProps {
  /** Optional time-series telemetry events from fuzzing engine coverage counters */
  series?: CorpusStatPoint[];
  /** Total unique crash count observed */
  uniqueCrashes?: number;
  /** Optional title header override */
  title?: string;
}

export function CorpusStatsPanel({
  series,
  uniqueCrashes = 0,
  title = 'Corpus Engine Telemetry',
}: CorpusStatsPanelProps) {
  // Downsample data BEFORE rendering chart to ensure <100ms render performance under 5k points
  const downsampledData = useMemo(() => {
    if (!series || series.length === 0) return [];
    return downsampleCorpusStats(series, 500);
  }, [series]);

  // Graceful degradation path when series is missing or empty
  if (!series || series.length === 0) {
    return (
      <div
        className="card card-padding space-y-4"
        id="corpus-stats-explainer-card"
        role="region"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <span className="text-xs text-meta px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            No Counter Stream
          </span>
        </div>

        <div className="p-6 rounded border border-amber-500/30 bg-amber-500/10 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-lg">
            !
          </div>
          <p className="text-sm font-semibold text-amber-300">
            Counters require engine builds newer than current fixtures
          </p>
          <p className="text-xs text-meta max-w-md mx-auto">
            Corpus size, execution velocity, and coverage momentum telemetry are emitted by Soroban-CrashLab engine v2.4+.
            Upgrade fixture build or select a run executed with counter logging enabled.
          </p>
        </div>
      </div>
    );
  }

  const latest = series[series.length - 1];

  const formattedChartData = downsampledData.map((pt) => ({
    ...pt,
    timeFormatted: new Date(pt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));

  return (
    <div className="card card-padding space-y-6" id="corpus-stats-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p className="text-meta text-xs mt-0.5">
            Engine coverage telemetry ({series.length.toLocaleString()} raw data points)
          </p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Live Counter Feed
        </span>
      </div>

      {/* Four Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="corpus-stat-tiles">
        <div className="p-4 rounded bg-slate-900/50 border border-slate-800/80">
          <p className="text-meta text-xs uppercase tracking-wider">Corpus Size</p>
          <p className="text-2xl font-bold mt-1 text-white">{latest.corpusSize.toLocaleString()}</p>
          <p className="text-[10px] text-emerald-400 mt-1">Total inputs retained</p>
        </div>

        <div className="p-4 rounded bg-slate-900/50 border border-slate-800/80">
          <p className="text-meta text-xs uppercase tracking-wider">Inputs / Sec</p>
          <p className="text-2xl font-bold mt-1 text-sky-400">{latest.execsPerSec.toLocaleString()}</p>
          <p className="text-[10px] text-meta mt-1">Executions velocity</p>
        </div>

        <div className="p-4 rounded bg-slate-900/50 border border-slate-800/80">
          <p className="text-meta text-xs uppercase tracking-wider">Coverage %</p>
          <p className="text-2xl font-bold mt-1 text-indigo-400">{latest.coveragePct.toFixed(1)}%</p>
          <p className="text-[10px] text-indigo-300 mt-1">Engine code coverage</p>
        </div>

        <div className="p-4 rounded bg-slate-900/50 border border-slate-800/80">
          <p className="text-meta text-xs uppercase tracking-wider">Unique Crashes</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{uniqueCrashes.toLocaleString()}</p>
          <p className="text-[10px] text-amber-300/80 mt-1">De-duplicated velocity</p>
        </div>
      </div>

      {/* Coverage Line Chart */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-meta">
            Coverage Momentum Over Time
          </h3>
          <span className="text-[10px] text-meta">
            {downsampledData.length} downsampled chart points
          </span>
        </div>

        <div className="h-64 w-full" id="corpus-coverage-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="coverageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />

              <XAxis
                dataKey="timeFormatted"
                stroke="#94a3b8"
                style={{ fontSize: '10px' }}
                tickLine={false}
              />

              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: '10px' }}
                domain={[0, 100]}
                unit="%"
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.375rem',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
                formatter={(val: unknown) => {
                  const num = typeof val === 'number' ? val : Number(val) || 0;
                  return [`${num.toFixed(1)}%`, 'Coverage'];
                }}
                labelFormatter={(label) => `Time: ${label}`}
              />

              <Area
                type="monotone"
                dataKey="coveragePct"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#coverageGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default CorpusStatsPanel;
