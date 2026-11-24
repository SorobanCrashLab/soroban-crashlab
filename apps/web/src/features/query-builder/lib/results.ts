/**
 * Result-explorer transforms (#2339): pivot, chart series, timeline buckets,
 * exports and drill-down links. All pure so the grid, pivot, chart and
 * timeline views are just different renderings of the same rows.
 */

import { csvEscape } from '@/app/csv-escape';
import type { Cell, ResultColumn, ResultRow } from './engine';
import { REDACTED } from './engine';

export type PivotAgg = 'sum' | 'count' | 'avg' | 'max';

export interface PivotTable {
  rowKey: string;
  columnKey: string;
  valueKey: string;
  rowValues: string[];
  columnValues: string[];
  /** cells[row][column] */
  cells: Array<Array<number | null>>;
  rowTotals: number[];
}

const label = (cell: Cell) => (cell === null ? '(empty)' : String(cell));

export function pivotRows(
  rows: readonly ResultRow[],
  rowKey: string,
  columnKey: string,
  valueKey: string,
  agg: PivotAgg = 'sum',
): PivotTable {
  const rowValues: string[] = [];
  const columnValues: string[] = [];
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const r = label(row[rowKey] ?? null);
    const c = label(row[columnKey] ?? null);
    if (!rowValues.includes(r)) rowValues.push(r);
    if (!columnValues.includes(c)) columnValues.push(c);
    const value = row[valueKey];
    const key = `${r}\u0000${c}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(agg === 'count' ? 1 : typeof value === 'number' ? value : NaN);
    buckets.set(key, bucket);
  }
  rowValues.sort();
  columnValues.sort();
  const reduce = (values: number[] | undefined): number | null => {
    if (!values || values.length === 0) return null;
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return null;
    switch (agg) {
      case 'count':
      case 'sum':
        return finite.reduce((sum, value) => sum + value, 0);
      case 'avg':
        return Math.round((finite.reduce((sum, value) => sum + value, 0) / finite.length) * 100) / 100;
      case 'max':
        return Math.max(...finite);
    }
  };
  const cells = rowValues.map((r) => columnValues.map((c) => reduce(buckets.get(`${r}\u0000${c}`))));
  return {
    rowKey,
    columnKey,
    valueKey,
    rowValues,
    columnValues,
    cells,
    rowTotals: cells.map((row) => row.reduce<number>((sum, value) => sum + (value ?? 0), 0)),
  };
}

export interface ChartPoint {
  label: string;
  value: number;
}

/** Category/value pairs for the bar chart; non-numeric values are skipped. */
export function chartSeries(rows: readonly ResultRow[], categoryKey: string, valueKey: string, max = 30): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const row of rows) {
    const value = row[valueKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    points.push({ label: label(row[categoryKey] ?? null), value });
    if (points.length >= max) break;
  }
  return points;
}

export interface TimelineBucket {
  start: number;
  end: number;
  count: number;
}

/** Equal-width buckets over a timestamp column. */
export function timelineBuckets(rows: readonly ResultRow[], timeKey: string, bucketCount = 24): TimelineBucket[] {
  const times = rows
    .map((row) => row[timeKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (times.length === 0) return [];
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const width = span / bucketCount;
  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    start: Math.round(min + index * width),
    end: Math.round(min + (index + 1) * width),
    count: 0,
  }));
  for (const time of times) {
    const index = Math.min(bucketCount - 1, Math.floor((time - min) / width));
    buckets[index].count += 1;
  }
  return buckets;
}

/** CSV cell that cannot be interpreted as a spreadsheet formula. */
export function safeCsvCell(cell: Cell): string {
  if (cell === null) return '';
  const text = String(cell);
  const guarded = /^[=+\-@\t\r]/.test(text) && typeof cell === 'string' ? `'${text}` : text;
  return csvEscape(guarded);
}

export function toCsv(columns: readonly ResultColumn[], rows: readonly ResultRow[]): string {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => safeCsvCell(row[column.key] ?? null)).join(','));
  return [header, ...body].join('\n');
}

export function toJson(columns: readonly ResultColumn[], rows: readonly ResultRow[], fingerprint: string): string {
  return JSON.stringify(
    {
      fingerprint,
      columns: columns.map(({ key, type, redacted }) => ({ key, type, redacted: Boolean(redacted) })),
      rows,
    },
    null,
    2,
  );
}

/**
 * Where a cell value leads (#111/#081/#067): entity detail pages or a log
 * search scoped to the value. Returns null for redacted or unlinkable cells.
 */
export function drillDownHref(column: ResultColumn, cell: Cell): string | null {
  if (cell === null || cell === REDACTED || !column.entity || !column.field) return null;
  const value = encodeURIComponent(String(cell));
  const ref = `${column.entity}.${column.field}`;
  switch (ref) {
    case 'runs.id':
    case 'crashes.run_id':
    case 'logs.run_id':
    case 'traces.run_id':
    case 'metrics.run_id':
      return `/runs/${value}`;
    case 'runs.campaign_id':
    case 'logs.campaign_id':
      return `/campaigns/${value}`;
    case 'logs.trace_id':
    case 'traces.trace_id':
      return `/logs?q=${encodeURIComponent(`trace_id:${String(cell)}`)}`;
    case 'logs.error_code':
      return `/logs?q=${encodeURIComponent(`error_code:${String(cell)}`)}`;
    case 'crashes.signature':
      return `/triage?signature=${value}`;
    case 'ci.id':
      return `/quality/ci?run=${value}`;
    default:
      return null;
  }
}

export function formatCell(column: ResultColumn, cell: Cell): string {
  if (cell === null) return '—';
  if (column.type === 'timestamp' && typeof cell === 'number') {
    return new Date(cell).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
  }
  if (typeof cell === 'number') return cell.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return String(cell);
}
