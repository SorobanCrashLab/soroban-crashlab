"use client";

/**
 * Responsive SVG time-series chart (#2302): multi-series, multi-axis,
 * normalization, brush zoom, synced cursor, threshold bands, annotations,
 * automatic downsampling with a fidelity indicator, and an accessible data
 * table / keyboard mode.
 */

import { useId, useMemo, useState } from 'react';
import { downsample, sliceRange, type DownsampleStrategy, type Point } from '../transforms/downsample';
import { NORMALIZE_LABELS, normalizeSeries, valueDomain, type NormalizeMode } from '../transforms/normalize';
import { useSyncedCharts } from '../hooks/useSyncedCharts';
import { useBrushZoom } from './BrushZoomController';
import ChartLegend from './ChartLegend';
import ChartTooltip from './ChartTooltip';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  unit?: string;
  data: Point[];
  /** 'left' or 'right' value axis (ignored when normalized). */
  axis?: 'left' | 'right';
  dashed?: boolean;
}

export interface ChartBand {
  from: number;
  to: number;
  label: string;
  color?: string;
}

export interface ChartAnnotation {
  t: number;
  label: string;
}

export interface TimeSeriesChartProps {
  title: string;
  series: ChartSeries[];
  /** Charts sharing a group id share cursor and visible range. */
  syncGroup?: string;
  normalize?: NormalizeMode;
  /** Horizontal threshold lines (values in the left axis unit). */
  thresholds?: Array<{ value: number; label: string }>;
  bands?: ChartBand[];
  annotations?: ChartAnnotation[];
  height?: number;
  maxPoints?: number;
  strategy?: DownsampleStrategy;
  timeZone?: string;
  /** Controlled visible range (e.g. from URL state). */
  range?: [number, number] | null;
  onRangeChange?: (range: [number, number] | null) => void;
  hiddenSeries?: string[];
  onToggleSeries?: (id: string) => void;
}

const W = 800;
const M = { top: 12, right: 52, bottom: 28, left: 52 };

function fmt(v: number): string {
  return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : Number(v.toPrecision(4)).toString();
}

export default function TimeSeriesChart({
  title,
  series,
  syncGroup = 'default',
  normalize = 'none',
  thresholds = [],
  bands = [],
  annotations = [],
  height = 260,
  maxPoints = 600,
  strategy = 'lttb',
  timeZone = 'UTC',
  range: controlledRange,
  onRangeChange,
  hiddenSeries,
  onToggleSeries,
}: TimeSeriesChartProps) {
  const uid = useId();
  const sync = useSyncedCharts(syncGroup);
  const [localHidden, setLocalHidden] = useState<string[]>([]);
  const [showTable, setShowTable] = useState(false);
  const hidden = hiddenSeries ?? localHidden;
  const range = controlledRange !== undefined ? controlledRange : sync.range;

  const setRange = (r: [number, number] | null) => {
    sync.setRange(r);
    onRangeChange?.(r);
  };

  const fullExtent = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      if (s.data.length) {
        lo = Math.min(lo, s.data[0].t);
        hi = Math.max(hi, s.data[s.data.length - 1].t);
      }
    }
    return lo === Infinity ? [0, 1] : [lo, hi];
  }, [series]);

  const [t0, t1] = range ?? fullExtent;
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const xOf = (t: number) => M.left + ((t - t0) / Math.max(t1 - t0, 1)) * plotW;
  const timeOf = (x: number) => t0 + ((x - M.left) / plotW) * (t1 - t0);

  const prepared = useMemo(() => {
    return series
      .filter((s) => !hidden.includes(s.id))
      .map((s) => {
        const visible = sliceRange(normalizeSeries(s.data, normalize), t0, t1);
        const ds = downsample(visible, strategy, maxPoints);
        return { s, ds, domain: valueDomain(ds.points) };
      });
  }, [series, hidden, normalize, t0, t1, strategy, maxPoints]);

  const usesRight = normalize === 'none' && prepared.some((p) => p.s.axis === 'right');
  const domainFor = (axis: 'left' | 'right') => {
    const group = prepared.filter((p) => (normalize === 'none' ? (p.s.axis ?? 'left') === axis : axis === 'left'));
    if (!group.length) return [0, 1] as [number, number];
    return [Math.min(...group.map((g) => g.domain[0])), Math.max(...group.map((g) => g.domain[1]))] as [number, number];
  };
  const left = domainFor('left');
  const right = domainFor('right');
  const yOf = (v: number, axis: 'left' | 'right') => {
    const [lo, hi] = axis === 'right' && usesRight ? right : left;
    return M.top + plotH - ((v - lo) / Math.max(hi - lo, 1e-9)) * plotH;
  };

  const brush = useBrushZoom({
    left: M.left,
    right: W - M.right,
    pxToTime: timeOf,
    onBrush: (r) => setRange([Math.round(r[0]), Math.round(r[1])]),
  });

  const cursor = sync.cursor;
  const nearest = (s: ChartSeries & { pts: Point[] }) => {
    if (cursor === null || !s.pts.length) return null;
    let best = s.pts[0];
    for (const p of s.pts) if (Math.abs(p.t - cursor) < Math.abs(best.t - cursor)) best = p;
    return best;
  };
  const tooltipRows = prepared.flatMap(({ s, ds }) => {
    const p = nearest({ ...s, pts: ds.points });
    return p ? [{ id: s.id, label: s.label, color: s.color, value: `${fmt(p.v)}${normalize === 'none' && s.unit ? ` ${s.unit}` : ''}` }] : [];
  });
  const formatTime = (t: number) =>
    new Date(t).toLocaleString(undefined, { timeZone, dateStyle: 'short', timeStyle: 'medium' });

  const toggle = (id: string) => {
    if (onToggleSeries) onToggleSeries(id);
    else setLocalHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  };

  const reduced = prepared.some((p) => p.ds.reduced);
  const minFidelity = prepared.length ? Math.min(...prepared.map((p) => p.ds.fidelity)) : 1;
  const step = Math.max((t1 - t0) / 50, 1);

  return (
    <figure className="w-full" aria-labelledby={`${uid}-title`}>
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span id={`${uid}-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
          <span className="ml-2 text-xs font-normal text-zinc-500">{NORMALIZE_LABELS[normalize]}</span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          {reduced && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" title="Showing a downsampled view; zoom in for raw data">
              {Math.round(minFidelity * 100)}% of points shown
            </span>
          )}
          {range && (
            <button type="button" onClick={() => setRange(null)} className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Reset zoom
            </button>
          )}
          <button type="button" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            {showTable ? 'Show chart' : 'Show data table'}
          </button>
        </span>
      </figcaption>

      {showTable ? (
        <DataTable series={prepared.map((p) => ({ s: p.s, points: p.ds.points }))} formatTime={formatTime} />
      ) : (
        <div className="relative">
          <svg
            role="img"
            aria-label={`${title}. ${summarize(prepared.map((p) => ({ s: p.s, points: p.ds.points })))} Use arrow keys to move the cursor, Escape to clear.`}
            tabIndex={0}
            viewBox={`0 0 ${W} ${height}`}
            className="h-auto w-full touch-none select-none rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            onPointerDown={brush.onPointerDown}
            onPointerMove={(e) => {
              brush.onPointerMove(e);
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * W;
              if (x >= M.left && x <= W - M.right) sync.setCursor(Math.round(timeOf(x)));
            }}
            onPointerUp={brush.onPointerUp}
            onPointerLeave={() => {
              brush.cancel();
              sync.setCursor(null);
            }}
            onKeyDown={(e) => {
              const base = cursor ?? (t0 + t1) / 2;
              if (e.key === 'ArrowRight') sync.setCursor(Math.min(Math.round(base + step), t1));
              else if (e.key === 'ArrowLeft') sync.setCursor(Math.max(Math.round(base - step), t0));
              else if (e.key === 'Escape') sync.setCursor(null);
              else if (e.key === '+') setRange([Math.round(t0 + (t1 - t0) * 0.25), Math.round(t1 - (t1 - t0) * 0.25)]);
              else if (e.key === '-') setRange(null);
              else return;
              e.preventDefault();
            }}
          >
            {bands.map((b) => (
              <g key={`${b.label}-${b.from}`}>
                <rect x={xOf(Math.max(b.from, t0))} y={M.top} width={Math.max(xOf(Math.min(b.to, t1)) - xOf(Math.max(b.from, t0)), 0)} height={plotH} fill={b.color ?? '#f59e0b'} opacity={0.15} />
                <text x={xOf(Math.max(b.from, t0)) + 4} y={M.top + 12} fontSize="10" fill="currentColor" opacity={0.7}>{b.label}</text>
              </g>
            ))}
            {thresholds.map((th) => (
              <g key={th.label}>
                <line x1={M.left} x2={W - M.right} y1={yOf(th.value, 'left')} y2={yOf(th.value, 'left')} stroke="#ef4444" strokeDasharray="4 4" />
                <text x={W - M.right - 4} y={yOf(th.value, 'left') - 3} textAnchor="end" fontSize="10" fill="#ef4444">{th.label}</text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={M.left} x2={W - M.right} y1={M.top + plotH * f} y2={M.top + plotH * f} stroke="currentColor" opacity={0.08} />
                <text x={M.left - 6} y={M.top + plotH * f + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>{fmt(left[1] - (left[1] - left[0]) * f)}</text>
                {usesRight && (
                  <text x={W - M.right + 6} y={M.top + plotH * f + 3} fontSize="10" fill="currentColor" opacity={0.7}>{fmt(right[1] - (right[1] - right[0]) * f)}</text>
                )}
              </g>
            ))}
            {[0, 0.5, 1].map((f) => (
              <text key={f} x={M.left + plotW * f} y={height - 8} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fontSize="10" fill="currentColor" opacity={0.7}>
                {new Date(t0 + (t1 - t0) * f).toLocaleTimeString(undefined, { timeZone, hour: '2-digit', minute: '2-digit' })}
              </text>
            ))}
            {prepared.map(({ s, ds }) => (
              <polyline
                key={s.id}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                points={ds.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.v, s.axis ?? 'left').toFixed(1)}`).join(' ')}
              />
            ))}
            {annotations
              .filter((a) => a.t >= t0 && a.t <= t1)
              .map((a) => (
                <g key={`${a.t}-${a.label}`}>
                  <line x1={xOf(a.t)} x2={xOf(a.t)} y1={M.top} y2={M.top + plotH} stroke="#6366f1" strokeDasharray="2 3" />
                  <text x={xOf(a.t) + 3} y={M.top + plotH - 4} fontSize="10" fill="#6366f1">{a.label}</text>
                </g>
              ))}
            {cursor !== null && cursor >= t0 && cursor <= t1 && (
              <line x1={xOf(cursor)} x2={xOf(cursor)} y1={M.top} y2={M.top + plotH} stroke="currentColor" opacity={0.5} />
            )}
            {brush.selection && (
              <rect x={Math.min(...brush.selection)} y={M.top} width={Math.abs(brush.selection[1] - brush.selection[0])} height={plotH} fill="#3b82f6" opacity={0.2} />
            )}
          </svg>
          {cursor !== null && cursor >= t0 && cursor <= t1 && tooltipRows.length > 0 && (
            <ChartTooltip timestamp={formatTime(cursor)} rows={tooltipRows} leftPct={((xOf(cursor)) / W) * 100} />
          )}
        </div>
      )}

      <div className="mt-2">
        <ChartLegend
          items={series.map((s) => ({ id: s.id, label: s.label, color: s.color, unit: normalize === 'none' ? s.unit : undefined, hidden: hidden.includes(s.id) }))}
          onToggle={toggle}
        />
      </div>
    </figure>
  );
}

/** Plain-language trend summary for screen readers. */
export function summarize(rows: Array<{ s: ChartSeries; points: Point[] }>): string {
  const parts = rows
    .filter((r) => r.points.length > 1)
    .map(({ s, points }) => {
      const first = points[0].v;
      const last = points[points.length - 1].v;
      const max = Math.max(...points.map((p) => p.v));
      const dir = last > first ? 'rose' : last < first ? 'fell' : 'was flat';
      return `${s.label} ${dir} from ${fmt(first)} to ${fmt(last)}, peaking at ${fmt(max)}.`;
    });
  return parts.length ? parts.join(' ') : 'No data in the selected range.';
}

function DataTable({
  series,
  formatTime,
}: {
  series: Array<{ s: ChartSeries; points: Point[] }>;
  formatTime: (t: number) => string;
}) {
  const times = Array.from(new Set(series.flatMap((r) => r.points.map((p) => p.t)))).sort((a, b) => a - b).slice(0, 200);
  const lookup = series.map((r) => new Map(r.points.map((p) => [p.t, p.v])));
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Chart data (first 200 timestamps)</caption>
        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
          <tr>
            <th scope="col" className="px-2 py-1">Time</th>
            {series.map((r) => (
              <th key={r.s.id} scope="col" className="px-2 py-1">{r.s.label}{r.s.unit ? ` (${r.s.unit})` : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t} className="border-t border-zinc-100 dark:border-zinc-800">
              <th scope="row" className="px-2 py-1 font-normal">{formatTime(t)}</th>
              {lookup.map((m, i) => (
                <td key={series[i].s.id} className="px-2 py-1 font-mono">{m.has(t) ? fmt(m.get(t) as number) : '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
