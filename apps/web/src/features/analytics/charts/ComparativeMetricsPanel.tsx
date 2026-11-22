"use client";

/**
 * Comparative metrics panel (#2302): normalization picker, compare-to-previous
 * period, range presets, export (CSV / PNG-ready SVG data) and shareable URL.
 */

import { useMemo, useState } from 'react';
import TimeSeriesChart, { type ChartSeries } from '@/components/charts/primitives/TimeSeriesChart';
import { shiftSeries, NORMALIZE_LABELS, type NormalizeMode } from '@/components/charts/transforms/normalize';
import { DEFAULT_CHART_STATE, decodeChartState, encodeChartState, type ChartUrlState } from './ChartStateUrl';

export interface ComparativeMetricsPanelProps {
  title?: string;
  series: ChartSeries[];
  /** Duration of the "previous period" overlay offset, ms. Defaults to the data span. */
  syncGroup?: string;
}

const PRESETS: Array<{ id: string; label: string; ms: number | null }> = [
  { id: '1h', label: '1h', ms: 3_600_000 },
  { id: '24h', label: '24h', ms: 86_400_000 },
  { id: '7d', label: '7d', ms: 7 * 86_400_000 },
  { id: 'all', label: 'All', ms: null },
];

function toCsv(series: ChartSeries[]): string {
  const rows = ['timestamp,series,value'];
  for (const s of series) for (const p of s.data) rows.push(`${new Date(p.t).toISOString()},${s.id},${p.v}`);
  return rows.join('\n');
}

export default function ComparativeMetricsPanel({ title = 'Comparative metrics', series, syncGroup = 'comparative' }: ComparativeMetricsPanelProps) {
  const [state, setState] = useState<ChartUrlState>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHART_STATE;
    return decodeChartState(window.location.search);
  });
  const [copied, setCopied] = useState(false);

  const extent = useMemo(() => {
    const all = series.flatMap((s) => s.data.map((p) => p.t));
    return all.length ? [Math.min(...all), Math.max(...all)] : [0, 1];
  }, [series]);

  const visible = state.series.length ? series.filter((s) => state.series.includes(s.id)) : series;
  const withCompare = useMemo(() => {
    if (!state.compare) return visible;
    const span = extent[1] - extent[0];
    return [
      ...visible,
      ...visible.map((s) => ({ ...s, id: `${s.id}-prev`, label: `${s.label} (previous period)`, dashed: true, data: shiftSeries(s.data, span) })),
    ];
  }, [visible, state.compare, extent]);

  const update = (patch: Partial<ChartUrlState>) => {
    const next = { ...state, ...patch };
    setState(next);
    if (typeof window !== 'undefined') {
      const q = encodeChartState(next);
      window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
    }
  };

  const hidden = series.filter((s) => state.series.length > 0 && !state.series.includes(s.id)).map((s) => s.id);

  return (
    <section aria-label={title} className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          Normalize
          <select
            value={state.normalize}
            onChange={(e) => update({ normalize: e.target.value as NormalizeMode })}
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            {(Object.keys(NORMALIZE_LABELS) as NormalizeMode[]).map((m) => (
              <option key={m} value={m}>{NORMALIZE_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={state.compare} onChange={(e) => update({ compare: e.target.checked })} />
          Compare to previous period
        </label>
        <span className="flex items-center gap-1" role="group" aria-label="Range presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={() => update({ range: p.ms ? [Math.max(extent[1] - p.ms, extent[0]), extent[1]] : null })}
            >
              {p.label}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => {
              const blob = new Blob([toCsv(withCompare)], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'chart-data.csv';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </span>
      </div>
      <TimeSeriesChart
        title={title}
        series={withCompare}
        syncGroup={syncGroup}
        normalize={state.normalize}
        range={state.range}
        onRangeChange={(range) => update({ range })}
        hiddenSeries={hidden}
        onToggleSeries={(id) => {
          const current = state.series.length ? state.series : series.map((s) => s.id);
          update({ series: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
        }}
      />
    </section>
  );
}
