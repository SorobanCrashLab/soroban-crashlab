/**
 * In-memory execution engine for visual queries (#2339).
 *
 * Deterministic by construction: hash joins preserve left-row order, groups
 * keep first-seen order, sorting is stable with nulls last, and the time
 * window is anchored to an explicit `now` (or the newest value in the data,
 * so fixture datasets never fall out of a "last 7 days" window).
 *
 * Guardrails: scanned rows, intermediate (post-join) rows and wall time are
 * all bounded. Hitting a bound returns a partial result flagged as such
 * rather than throwing, so the UI can say what was cut.
 */

import { redactText } from '@/lib/redaction';
import { ENTITIES, findRelation, getField, type EntityName, type FieldType, type Literal } from './schema';
import {
  TIME_PRESET_MS,
  entitiesInQuery,
  flattenConditions,
  isAggregateQuery,
  isParamRef,
  type AggregationBlock,
  type FilterCondition,
  type FilterGroup,
  type VisualQuery,
} from './model';
import { queryFingerprint } from './serialize';
import { canSeeRestricted, validateQuery, type ViewerRole } from './validate';

export type Cell = Literal | null;
export type SourceRow = Record<string, Cell>;
export type ResultRow = Record<string, Cell>;
export type Datasets = Partial<Record<EntityName, readonly SourceRow[]>>;

export const REDACTED = '[REDACTED]';

export interface ExecutionLimits {
  /** Rows read from adapters across source + joins. */
  maxScanRows: number;
  /** Rows alive after joins (fan-out guard). */
  maxIntermediateRows: number;
  timeoutMs: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  maxScanRows: 50_000,
  maxIntermediateRows: 100_000,
  timeoutMs: 2_000,
};

export interface ExecuteOptions {
  role?: ViewerRole;
  limits?: Partial<ExecutionLimits>;
  /** Anchor for relative windows. Defaults to the newest window-field value. */
  now?: number;
  clock?: () => number;
}

export interface ResultColumn {
  key: string;
  label: string;
  type: FieldType;
  entity?: EntityName;
  field?: string;
  redacted?: boolean;
  aggregation?: AggregationBlock['fn'];
}

export interface ExecutionStats {
  scannedRows: number;
  joinedRows: number;
  matchedRows: number;
  returnedRows: number;
  truncated: boolean;
  timedOut: boolean;
  tookMs: number;
  window: { from: number | null; to: number | null } | null;
}

export interface QueryResult {
  ok: true;
  fingerprint: string;
  columns: ResultColumn[];
  rows: ResultRow[];
  stats: ExecutionStats;
  warnings: string[];
}

export interface QueryFailure {
  ok: false;
  errors: string[];
  warnings: string[];
}

class Timeout extends Error {}

function qualify(entity: EntityName, row: SourceRow): ResultRow {
  const out: ResultRow = {};
  for (const [key, value] of Object.entries(row)) out[`${entity}.${key}`] = value ?? null;
  return out;
}

function nullRow(entity: EntityName): ResultRow {
  const out: ResultRow = {};
  for (const field of ENTITIES[entity].fields) out[`${entity}.${field.name}`] = null;
  return out;
}

function compare(a: Cell, b: Cell): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b));
}

function matchesCondition(row: ResultRow, condition: FilterCondition): boolean {
  const cell = row[condition.field] ?? null;
  const value = condition.value;
  if (isParamRef(value)) return false; // unbound params never match
  switch (condition.op) {
    case 'is_null':
      return cell === null || cell === '';
    case 'not_null':
      return cell !== null && cell !== '';
    case 'eq':
      return cell !== null && cell === value;
    case 'neq':
      return cell !== null && cell !== value;
    case 'gt':
      return cell !== null && value !== null && compare(cell, value as Cell) > 0;
    case 'gte':
      return cell !== null && value !== null && compare(cell, value as Cell) >= 0;
    case 'lt':
      return cell !== null && value !== null && compare(cell, value as Cell) < 0;
    case 'lte':
      return cell !== null && value !== null && compare(cell, value as Cell) <= 0;
    case 'between': {
      if (cell === null || !Array.isArray(value) || value.length !== 2) return false;
      return compare(cell, value[0]) >= 0 && compare(cell, value[1]) <= 0;
    }
    case 'in':
      return cell !== null && Array.isArray(value) && value.includes(cell);
    case 'not_in':
      return cell !== null && Array.isArray(value) && !value.includes(cell);
    case 'contains':
      return typeof cell === 'string' && typeof value === 'string' && cell.toLowerCase().includes(value.toLowerCase());
    case 'starts_with':
      return typeof cell === 'string' && typeof value === 'string' && cell.toLowerCase().startsWith(value.toLowerCase());
  }
}

export function matchesGroup(row: ResultRow, group: FilterGroup): boolean {
  if (group.children.length === 0) return !group.negate;
  const results = group.children.map((child) =>
    child.kind === 'condition' ? matchesCondition(row, child) : matchesGroup(row, child),
  );
  const combined = group.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
  return group.negate ? !combined : combined;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function aggregate(rows: readonly ResultRow[], agg: Pick<AggregationBlock, 'fn' | 'field'>): Cell {
  if (agg.fn === 'count' && !agg.field) return rows.length;
  const values = rows.map((row) => row[agg.field ?? ''] ?? null).filter((value): value is Literal => value !== null);
  switch (agg.fn) {
    case 'count':
      return values.length;
    case 'count_distinct':
      return new Set(values).size;
    default: {
      const numbers = values.filter((value): value is number => typeof value === 'number');
      if (numbers.length === 0) return null;
      switch (agg.fn) {
        case 'sum':
          return round(numbers.reduce((sum, value) => sum + value, 0));
        case 'avg':
          return round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
        case 'min':
          return Math.min(...numbers);
        case 'max':
          return Math.max(...numbers);
        case 'p50':
          return percentile([...numbers].sort((a, b) => a - b), 50);
        case 'p95':
          return percentile([...numbers].sort((a, b) => a - b), 95);
      }
    }
  }
  return null;
}

/** Resolve a time window to absolute bounds. */
export function resolveWindow(
  query: VisualQuery,
  datasets: Datasets,
  now?: number,
): { from: number | null; to: number | null } | null {
  const window = query.timeWindow;
  if (!window || window.preset === 'all') return null;
  if (window.preset === 'custom') return { from: window.from, to: window.to };
  const field = getField(window.field);
  let anchor = now;
  if (anchor === undefined && field) {
    anchor = 0;
    for (const row of datasets[field.entity] ?? []) {
      const value = row[field.name];
      if (typeof value === 'number' && value > anchor) anchor = value;
    }
  }
  const to = anchor ?? 0;
  return { from: to - TIME_PRESET_MS[window.preset], to };
}

export function projectionColumns(query: VisualQuery, role: ViewerRole): ResultColumn[] {
  const canSee = canSeeRestricted(role);
  const fieldColumn = (ref: string): ResultColumn => {
    const field = getField(ref);
    return {
      key: ref,
      label: ref,
      type: field?.type ?? 'string',
      entity: field?.entity,
      field: field?.name,
      redacted: Boolean(field?.restricted && !canSee),
    };
  };
  if (isAggregateQuery(query)) {
    return [
      ...query.groupBy.map(fieldColumn),
      ...query.aggregations.map((agg): ResultColumn => {
        const field = agg.field ? getField(agg.field) : null;
        const type: FieldType =
          (agg.fn === 'min' || agg.fn === 'max') && field?.type === 'timestamp' ? 'timestamp' : 'number';
        return { key: agg.alias, label: agg.alias, type, aggregation: agg.fn };
      }),
    ];
  }
  if (query.select.length > 0) return query.select.map(fieldColumn);
  const refs: string[] = [];
  for (const entity of entitiesInQuery(query)) {
    for (const name of ENTITIES[entity].defaultSelect) refs.push(`${entity}.${name}`);
  }
  return refs.map(fieldColumn);
}

export function executeQuery(
  query: VisualQuery,
  datasets: Datasets,
  options: ExecuteOptions = {},
): QueryResult | QueryFailure {
  const role = options.role ?? 'analyst';
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const clock = options.clock ?? Date.now;
  const started = clock();
  const validation = validateQuery(query, role);
  const warnings = validation.warnings.map((issue) => issue.message);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors.map((issue) => issue.message), warnings };
  }
  if (flattenConditions(query.filters).some((condition) => isParamRef(condition.value))) {
    return { ok: false, errors: ['Bind parameters before executing the query.'], warnings };
  }

  let scanned = 0;
  let truncated = false;
  let timedOut = false;
  let ops = 0;
  const tick = () => {
    ops += 1;
    if (ops % 128 === 0 && clock() - started > limits.timeoutMs) throw new Timeout();
  };

  const window = resolveWindow(query, datasets, options.now);
  let rows: ResultRow[] = [];
  let joinedCount = 0;
  const matched: ResultRow[] = [];

  try {
    const sourceRows = datasets[query.source] ?? [];
    const budget = Math.max(0, limits.maxScanRows - scanned);
    if (sourceRows.length > budget) {
      truncated = true;
      warnings.push(`Scan limit reached: read ${budget} of ${sourceRows.length} ${query.source} rows.`);
    }
    rows = sourceRows.slice(0, budget).map((row) => {
      tick();
      return qualify(query.source, row);
    });
    scanned += rows.length;

    for (const join of query.joins) {
      const relation = findRelation(join.relation)!;
      const forward = relation.to === join.entity;
      const leftRef = forward ? `${relation.from}.${relation.fromField}` : `${relation.to}.${relation.toField}`;
      const rightField = forward ? relation.toField : relation.fromField;
      const rightRows = (datasets[join.entity] ?? []).slice(0, Math.max(0, limits.maxScanRows - scanned));
      if (rightRows.length < (datasets[join.entity] ?? []).length) {
        truncated = true;
        warnings.push(`Scan limit reached while joining ${join.entity}.`);
      }
      scanned += rightRows.length;
      const index = new Map<Cell, SourceRow[]>();
      for (const row of rightRows) {
        tick();
        const key = row[rightField] ?? null;
        if (key === null) continue;
        const bucket = index.get(key);
        if (bucket) bucket.push(row);
        else index.set(key, [row]);
      }
      const next: ResultRow[] = [];
      const empty = nullRow(join.entity);
      outer: for (const row of rows) {
        const matches = index.get(row[leftRef] ?? null) ?? [];
        if (matches.length === 0 && join.kind === 'left') {
          next.push({ ...row, ...empty });
        }
        for (const match of matches) {
          tick();
          if (next.length >= limits.maxIntermediateRows) {
            truncated = true;
            warnings.push(`Join fan-out capped at ${limits.maxIntermediateRows} rows; add filters before joining.`);
            break outer;
          }
          next.push({ ...row, ...qualify(join.entity, match) });
        }
      }
      rows = next;
    }
    joinedCount = rows.length;

    const windowField = query.timeWindow?.field;
    for (const row of rows) {
      tick();
      if (window && windowField) {
        const value = row[windowField];
        if (typeof value !== 'number') continue;
        if (window.from !== null && value < window.from) continue;
        if (window.to !== null && value > window.to) continue;
      }
      if (matchesGroup(row, query.filters)) matched.push(row);
    }
  } catch (error) {
    if (!(error instanceof Timeout)) throw error;
    timedOut = true;
    truncated = true;
    warnings.push(`Query exceeded the ${limits.timeoutMs} ms budget; showing a partial result.`);
  }

  const columns = projectionColumns(query, role);
  let output: ResultRow[];
  if (isAggregateQuery(query)) {
    const groups = new Map<string, ResultRow[]>();
    for (const row of matched) {
      const key = JSON.stringify(query.groupBy.map((ref) => row[ref] ?? null));
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    if (groups.size === 0 && query.groupBy.length === 0) groups.set('[]', []);
    output = [...groups.values()].map((bucket) => {
      const out: ResultRow = {};
      for (const ref of query.groupBy) out[ref] = bucket[0]?.[ref] ?? null;
      for (const agg of query.aggregations) out[agg.alias] = aggregate(bucket, agg);
      return out;
    });
  } else {
    output = matched.map((row) => {
      const out: ResultRow = {};
      for (const column of columns) out[column.key] = row[column.key] ?? null;
      return out;
    });
  }

  if (query.sort.length > 0) {
    const indexed = output.map((row, index) => ({ row, index }));
    indexed.sort((a, b) => {
      for (const sort of query.sort) {
        const delta = compare(a.row[sort.key] ?? null, b.row[sort.key] ?? null);
        if (delta !== 0) {
          // Nulls stay last in both directions.
          if (a.row[sort.key] === null || b.row[sort.key] === null) return delta;
          return sort.direction === 'asc' ? delta : -delta;
        }
      }
      return a.index - b.index;
    });
    output = indexed.map((entry) => entry.row);
  }

  const total = output.length;
  if (total > query.limit) {
    truncated = true;
    output = output.slice(0, query.limit);
  }

  const redactedKeys = columns.filter((column) => column.redacted).map((column) => column.key);
  output = output.map((row) => {
    const copy = { ...row };
    for (const key of redactedKeys) if (copy[key] !== null) copy[key] = REDACTED;
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === 'string' && value !== REDACTED) copy[key] = redactText(value);
    }
    return copy;
  });

  return {
    ok: true,
    fingerprint: queryFingerprint(query),
    columns,
    rows: output,
    stats: {
      scannedRows: scanned,
      joinedRows: joinedCount,
      matchedRows: matched.length,
      returnedRows: output.length,
      truncated,
      timedOut,
      tookMs: Math.max(0, clock() - started),
      window,
    },
    warnings: [...new Set(warnings)],
  };
}
