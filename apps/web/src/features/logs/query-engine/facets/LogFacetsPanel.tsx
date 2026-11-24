'use client';

/** Faceted filters, histogram brushing and field explorer (#075). */

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { LOG_FIELDS } from '../dsl/parser';
import type { UseLogQueryResult } from '../hooks/useLogQuery';

const FACET_LABELS: Record<string, string> = {
  level: 'Level',
  source: 'Source',
  contract: 'Contract',
  run_id: 'Run ID',
  campaign_id: 'Campaign ID',
  trace_id: 'Trace ID',
  error_code: 'Error code',
};

const PRESETS = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
  { label: '24h', ms: 24 * 60 * 60_000 },
];

export interface LogFacetsPanelProps {
  query: UseLogQueryResult;
}

export function LogFacetsPanel({ query }: LogFacetsPanelProps) {
  const {
    state, facets, histogram, toggleFacet, clearFacets, setTimeRange,
    setHistogramRange, setQuery, stats,
  } = query;
  const [valueFilter, setValueFilter] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ level: true, source: true });
  const brushRef = useRef<{ start: number; end: number } | null>(null);

  const peak = useMemo(() => Math.max(1, ...histogram.map((bucket) => bucket.count)), [histogram]);
  const activeCount = Object.values(state.facets).reduce((total, values) => total + values.length, 0);

  const handleBrushStart = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    const span = state.to - state.from;
    brushRef.current = { start: state.from + ratio * span, end: state.from + ratio * span };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleBrushMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!brushRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    brushRef.current.end = state.from + ratio * (state.to - state.from);
  };
  const handleBrushEnd = () => {
    const brush = brushRef.current;
    brushRef.current = null;
    if (!brush || Math.abs(brush.end - brush.start) < 1000) return;
    const range: [number, number] = [Math.min(brush.start, brush.end), Math.max(brush.start, brush.end)];
    setHistogramRange(range);
    setTimeRange(range[0], range[1]);
  };

  return (
    <aside aria-label="Log facets and histogram" className="space-y-4">
      <section className="card card-padding" aria-labelledby="log-time-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 id="log-time-heading" className="heading-section text-sm">Time range</h2>
          <div className="flex gap-1" role="group" aria-label="Time range presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="chip text-xs"
                onClick={() => setTimeRange(Date.now() - preset.ms, Date.now())}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div
          className="flex h-20 items-end gap-px bg-[var(--bg)] p-1 cursor-crosshair touch-none"
          role="img"
          aria-label={histogram.length > 0 ? `Event histogram with ${histogram.length} buckets, peak ${peak} events` : 'Histogram unavailable'}
          onPointerDown={handleBrushStart}
          onPointerMove={handleBrushMove}
          onPointerUp={handleBrushEnd}
          onPointerCancel={() => { brushRef.current = null; }}
        >
          {histogram.map((bucket, index) => (
            <div
              key={`${bucket.timestamp}-${index}`}
              className="flex-1 bg-[#0A66C2]/70 hover:bg-[#0A66C2]"
              style={{ height: `${Math.max(2, (bucket.count / peak) * 100)}%` }}
              title={`${new Date(bucket.timestamp).toISOString().slice(0, 16)} · ${bucket.count} events`}
            />
          ))}
        </div>
        <p className="text-meta mt-1">
          Sweep across the histogram to narrow the window. {stats ? `${stats.total.toLocaleString()} matched` : ''}
        </p>
        {state.histogramRange && (
          <button type="button" className="btn-ghost text-xs mt-1" onClick={() => { setHistogramRange(null); setTimeRange(Date.now() - 6 * 60 * 60_000, Date.now()); }}>
            Clear brushed range
          </button>
        )}
      </section>

      <section className="card card-padding" aria-labelledby="log-facets-heading">
        <div className="flex items-center justify-between mb-2">
          <h2 id="log-facets-heading" className="heading-section text-sm">Facets {activeCount > 0 ? `(${activeCount})` : ''}</h2>
          {activeCount > 0 && <button type="button" className="btn-ghost text-xs" onClick={clearFacets}>Clear</button>}
        </div>
        <div className="space-y-3">
          {facets.map((facet) => {
            const isExpanded = expanded[facet.field] ?? false;
            const filter = valueFilter[facet.field] ?? '';
            const values = facet.values.filter((item) => item.value.toLowerCase().includes(filter.toLowerCase()));
            return (
              <div key={facet.field}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left text-xs font-semibold"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded((current) => ({ ...current, [facet.field]: !isExpanded }))}
                >
                  <span>{FACET_LABELS[facet.field] ?? facet.field}</span>
                  <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded && (
                  <div>
                    <label className="sr-only" htmlFor={`facet-filter-${facet.field}`}>Filter {facet.field} values</label>
                    <input
                      id={`facet-filter-${facet.field}`}
                      className="input-field mt-1 py-1 text-xs"
                      placeholder="Filter values…"
                      value={filter}
                      onChange={(event) => setValueFilter((current) => ({ ...current, [facet.field]: event.target.value }))}
                    />
                    <ul className="mt-1 max-h-40 overflow-y-auto">
                      {values.map((item) => {
                        const checked = (state.facets[facet.field] ?? []).includes(item.value);
                        return (
                          <li key={item.value}>
                            <label className="flex items-center gap-2 py-0.5 text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFacet(facet.field, item.value)}
                              />
                              <span className="flex-1 truncate">{item.value}</span>
                              <span className="text-meta">{item.count.toLocaleString()}</span>
                            </label>
                          </li>
                        );
                      })}
                      {values.length === 0 && <li className="text-meta text-xs py-1">No values</li>}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card card-padding" aria-labelledby="field-explorer-heading">
        <h2 id="field-explorer-heading" className="heading-section text-sm mb-2">Field explorer</h2>
        <div className="flex flex-wrap gap-1">
          {LOG_FIELDS.map((field) => (
            <button
              key={field}
              type="button"
              className="chip text-xs"
              title={`Add ${field}: to the query`}
              onClick={() => {
                const next = state.query.trim();
                setQuery(`${next}${next ? ' AND ' : ''}${field}:`);
                document.getElementById('log-query-input')?.focus();
              }}
            >
              {field}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default LogFacetsPanel;
