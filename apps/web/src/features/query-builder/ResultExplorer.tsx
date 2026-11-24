'use client';

/**
 * Result explorer (#2339): grid, pivot, chart and timeline renderings of a
 * single query result, with drill-down links to the underlying entities and
 * CSV/JSON export. Charts are inline SVG with a data-table fallback so the
 * numbers are always available to assistive technology.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AccessibleTabs } from '@/components/AccessibleTabs';
import { downloadTextFile } from '@/app/utils/browser-download';
import type { QueryResult, ResultColumn } from './lib/engine';
import {
  chartSeries,
  drillDownHref,
  formatCell,
  pivotRows,
  timelineBuckets,
  toCsv,
  toJson,
  type PivotAgg,
} from './lib/results';

type ResultView = 'grid' | 'pivot' | 'chart' | 'timeline';

export interface ResultExplorerProps {
  result: QueryResult | null;
  status: 'idle' | 'running' | 'success' | 'error';
  error: string | null;
  /** Hide export controls inside embeds. */
  compact?: boolean;
  initialView?: ResultView;
}

function Grid({ result }: { result: QueryResult }) {
  return (
    <div className="table-responsive max-h-[28rem] overflow-auto">
      <table className="data-table text-sm">
        <caption className="sr-only">Query results, {result.rows.length} rows</caption>
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th key={column.key} scope="col" className="text-left whitespace-nowrap">
                {column.label}
                {column.redacted ? <span className="ds-badge ds-badge-warning ml-1">redacted</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={index}>
              {result.columns.map((column) => {
                const cell = row[column.key] ?? null;
                const href = drillDownHref(column, cell);
                const text = formatCell(column, cell);
                return (
                  <td key={column.key} className="whitespace-nowrap max-w-[24rem] truncate" title={text}>
                    {href ? (
                      <Link className="link" href={href}>
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnPicker({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: readonly ResultColumn[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <label className="text-sm flex items-center gap-1">
      {label}
      <select className="input-field" value={value} onChange={(event) => onChange(event.target.value)}>
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            {column.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PivotView({ result }: { result: QueryResult }) {
  const dimensions = result.columns.filter((column) => column.type !== 'number' && column.type !== 'timestamp');
  const measures = result.columns.filter((column) => column.type === 'number');
  const [rowKey, setRowKey] = useState(dimensions[0]?.key ?? '');
  const [columnKey, setColumnKey] = useState(dimensions[1]?.key ?? dimensions[0]?.key ?? '');
  const [valueKey, setValueKey] = useState(measures[0]?.key ?? '');
  const [agg, setAgg] = useState<PivotAgg>(measures.length > 0 ? 'sum' : 'count');
  const pivot = useMemo(() => pivotRows(result.rows, rowKey, columnKey, valueKey, agg), [agg, columnKey, result.rows, rowKey, valueKey]);

  if (dimensions.length === 0) {
    return <p className="text-meta">Pivoting needs at least one non-numeric column (group by a field first).</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ColumnPicker label="Rows" columns={dimensions} value={rowKey} onChange={setRowKey} />
        <ColumnPicker label="Columns" columns={dimensions} value={columnKey} onChange={setColumnKey} />
        {measures.length > 0 ? <ColumnPicker label="Value" columns={measures} value={valueKey} onChange={setValueKey} /> : null}
        <label className="text-sm flex items-center gap-1">
          Combine
          <select className="input-field" value={agg} onChange={(event) => setAgg(event.target.value as PivotAgg)}>
            <option value="sum">sum</option>
            <option value="avg">avg</option>
            <option value="max">max</option>
            <option value="count">count</option>
          </select>
        </label>
      </div>
      <div className="table-responsive overflow-auto">
        <table className="data-table text-sm">
          <caption className="sr-only">Pivot of {pivot.valueKey || 'rows'} by {rowKey} and {columnKey}</caption>
          <thead>
            <tr>
              <th scope="col">{rowKey}</th>
              {pivot.columnValues.map((value) => (
                <th key={value} scope="col">
                  {value}
                </th>
              ))}
              <th scope="col">total</th>
            </tr>
          </thead>
          <tbody>
            {pivot.rowValues.map((rowValue, rowIndex) => (
              <tr key={rowValue}>
                <th scope="row" className="text-left">
                  {rowValue}
                </th>
                {pivot.cells[rowIndex].map((cell, columnIndex) => (
                  <td key={columnIndex}>{cell === null ? '—' : cell.toLocaleString('en-US')}</td>
                ))}
                <td>
                  <strong>{pivot.rowTotals[rowIndex].toLocaleString('en-US')}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartView({ result }: { result: QueryResult }) {
  const measures = result.columns.filter((column) => column.type === 'number');
  const categories = result.columns.filter((column) => column.type !== 'number');
  const [valueKey, setValueKey] = useState(measures[0]?.key ?? '');
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key ?? result.columns[0]?.key ?? '');
  const points = useMemo(() => chartSeries(result.rows, categoryKey, valueKey), [categoryKey, result.rows, valueKey]);
  if (measures.length === 0) return <p className="text-meta">Charts need a numeric column (add an aggregation).</p>;
  const max = Math.max(1, ...points.map((point) => point.value));
  const barHeight = 22;
  const height = points.length * (barHeight + 6) + 10;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ColumnPicker label="Category" columns={categories.length > 0 ? categories : result.columns} value={categoryKey} onChange={setCategoryKey} />
        <ColumnPicker label="Value" columns={measures} value={valueKey} onChange={setValueKey} />
      </div>
      <svg role="img" aria-label={`Bar chart of ${valueKey} by ${categoryKey}`} viewBox={`0 0 600 ${height}`} className="w-full max-w-3xl">
        {points.map((point, index) => {
          const y = 5 + index * (barHeight + 6);
          const width = Math.max(1, (point.value / max) * 380);
          return (
            <g key={`${point.label}-${index}`}>
              <text x={0} y={y + 15} fontSize={12} fill="currentColor">
                {point.label.length > 22 ? `${point.label.slice(0, 21)}…` : point.label}
              </text>
              <rect x={170} y={y} width={width} height={barHeight} rx={3} fill="var(--accent, #0A66C2)" opacity={0.85} />
              <text x={176 + width} y={y + 15} fontSize={12} fill="currentColor">
                {point.value.toLocaleString('en-US')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TimelineView({ result }: { result: QueryResult }) {
  const timeColumns = result.columns.filter((column) => column.type === 'timestamp');
  const [timeKey, setTimeKey] = useState(timeColumns[0]?.key ?? '');
  const buckets = useMemo(() => timelineBuckets(result.rows, timeKey), [result.rows, timeKey]);
  if (timeColumns.length === 0) return <p className="text-meta">Timeline needs a timestamp column.</p>;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const width = 600;
  const barWidth = buckets.length > 0 ? width / buckets.length : width;
  return (
    <div className="flex flex-col gap-2">
      <ColumnPicker label="Time" columns={timeColumns} value={timeKey} onChange={setTimeKey} />
      <svg role="img" aria-label={`Row count over ${timeKey}`} viewBox={`0 0 ${width} 120`} className="w-full max-w-3xl">
        {buckets.map((bucket, index) => {
          const height = (bucket.count / max) * 100;
          return (
            <rect key={bucket.start} x={index * barWidth + 1} y={110 - height} width={Math.max(1, barWidth - 2)} height={height} fill="var(--accent, #0A66C2)">
              <title>
                {new Date(bucket.start).toISOString()} – {bucket.count} rows
              </title>
            </rect>
          );
        })}
      </svg>
      {buckets.length > 0 ? (
        <p className="text-meta">
          {new Date(buckets[0].start).toISOString()} → {new Date(buckets[buckets.length - 1].end).toISOString()}
        </p>
      ) : null}
    </div>
  );
}

export function ResultExplorer({ result, status, error, compact = false, initialView = 'grid' }: ResultExplorerProps) {
  const [view, setView] = useState<ResultView>(initialView);

  return (
    <section className="card card-padding min-w-0" aria-label="Results" aria-busy={status === 'running'}>
      <div className="flex-between flex-wrap gap-2 mb-2">
        <h2 className="text-sm-semibold">Results</h2>
        <p className="text-meta" role="status" aria-live="polite">
          {status === 'running'
            ? 'Running…'
            : result
              ? `${result.stats.returnedRows.toLocaleString('en-US')} rows · scanned ${result.stats.scannedRows.toLocaleString('en-US')} · ${result.stats.tookMs} ms${
                  result.stats.truncated ? ' · partial' : ''
                }`
              : 'Run the query to see results.'}
        </p>
      </div>

      {error ? (
        <p className="field-error text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {result && result.warnings.length > 0 ? (
        <ul className="text-meta text-xs list-disc pl-5 mb-2" aria-label="Execution warnings">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <>
          {!compact ? (
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                className="btn-outline text-xs"
                onClick={() => downloadTextFile(toCsv(result.columns, result.rows), `query-${result.fingerprint}.csv`, 'text/csv')}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="btn-outline text-xs"
                onClick={() => downloadTextFile(toJson(result.columns, result.rows, result.fingerprint), `query-${result.fingerprint}.json`)}
              >
                Export JSON
              </button>
            </div>
          ) : null}
          <AccessibleTabs
            label="Result views"
            selected={view}
            onSelect={setView}
            tabs={[
              { id: 'grid', label: 'Grid' },
              { id: 'pivot', label: 'Pivot' },
              { id: 'chart', label: 'Chart' },
              { id: 'timeline', label: 'Timeline' },
            ]}
          >
            {result.rows.length === 0 ? <p className="text-meta">No rows matched.</p> : null}
            {result.rows.length > 0 && view === 'grid' ? <Grid result={result} /> : null}
            {result.rows.length > 0 && view === 'pivot' ? <PivotView key={result.fingerprint} result={result} /> : null}
            {result.rows.length > 0 && view === 'chart' ? <ChartView key={result.fingerprint} result={result} /> : null}
            {result.rows.length > 0 && view === 'timeline' ? <TimelineView key={result.fingerprint} result={result} /> : null}
          </AccessibleTabs>
        </>
      ) : null}
    </section>
  );
}
