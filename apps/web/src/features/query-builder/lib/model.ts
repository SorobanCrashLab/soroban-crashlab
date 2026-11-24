/**
 * Visual query model (#2339).
 *
 * The composer edits this tree; the DSL, canonical JSON, explain plan and the
 * engine are all pure functions of it. Block `id`s exist only so React can key
 * and focus blocks — they are stripped from the canonical form and
 * reassigned deterministically on parse, so two visually identical queries
 * always serialize to the same bytes and fingerprint.
 */

import type { AggregationFn, EntityName, FieldType, Literal, OperatorId } from './schema';

export const QUERY_VERSION = 1 as const;

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1_000;

export interface ParamRef {
  param: string;
}

export type ConditionValue = Literal | Literal[] | ParamRef | null;

export interface FilterCondition {
  id: string;
  kind: 'condition';
  field: string;
  op: OperatorId;
  value: ConditionValue;
}

export interface FilterGroup {
  id: string;
  kind: 'group';
  combinator: 'and' | 'or';
  negate: boolean;
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

export interface JoinBlock {
  id: string;
  relation: string;
  /** Entity being added by this join. */
  entity: EntityName;
  kind: 'inner' | 'left';
}

export interface AggregationBlock {
  id: string;
  fn: AggregationFn;
  /** Omitted for `count(*)`. */
  field: string | null;
  alias: string;
}

export interface SortBlock {
  id: string;
  /** A field ref (`runs.status`) or an aggregation alias. */
  key: string;
  direction: 'asc' | 'desc';
}

export type TimePreset = 'all' | 'last_1h' | 'last_24h' | 'last_7d' | 'last_30d' | 'custom';

export interface TimeWindow {
  field: string;
  preset: TimePreset;
  /** Epoch ms; used only with `custom`. */
  from: number | null;
  to: number | null;
}

export interface QueryParam {
  name: string;
  type: Exclude<FieldType, 'enum'>;
  defaultValue: Literal | null;
  description: string;
}

export interface VisualQuery {
  version: typeof QUERY_VERSION;
  source: EntityName;
  joins: JoinBlock[];
  filters: FilterGroup;
  timeWindow: TimeWindow | null;
  select: string[];
  groupBy: string[];
  aggregations: AggregationBlock[];
  sort: SortBlock[];
  limit: number;
  params: QueryParam[];
}

export const TIME_PRESET_MS: Record<Exclude<TimePreset, 'all' | 'custom'>, number> = {
  last_1h: 3_600_000,
  last_24h: 86_400_000,
  last_7d: 7 * 86_400_000,
  last_30d: 30 * 86_400_000,
};

export function isParamRef(value: unknown): value is ParamRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { param?: unknown }).param === 'string'
  );
}

let idCounter = 0;
/** UI-only ids. Never part of the canonical form. */
export function nextBlockId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}`;
}

export function emptyGroup(id = 'root', combinator: 'and' | 'or' = 'and'): FilterGroup {
  return { id, kind: 'group', combinator, negate: false, children: [] };
}

export function createQuery(source: EntityName = 'runs'): VisualQuery {
  return {
    version: QUERY_VERSION,
    source,
    joins: [],
    filters: emptyGroup(),
    timeWindow: null,
    select: [],
    groupBy: [],
    aggregations: [],
    sort: [],
    limit: DEFAULT_LIMIT,
    params: [],
  };
}

/** Entities present in the query, source first, in join order. */
export function entitiesInQuery(query: Pick<VisualQuery, 'source' | 'joins'>): EntityName[] {
  return [query.source, ...query.joins.map((join) => join.entity)];
}

export function isAggregateQuery(query: Pick<VisualQuery, 'groupBy' | 'aggregations'>): boolean {
  return query.groupBy.length > 0 || query.aggregations.length > 0;
}

/** Depth-first list of every condition in a filter tree. */
export function flattenConditions(group: FilterGroup): FilterCondition[] {
  const out: FilterCondition[] = [];
  const visit = (node: FilterNode) => {
    if (node.kind === 'condition') out.push(node);
    else node.children.forEach(visit);
  };
  visit(group);
  return out;
}

/** Every field ref a query touches (for permission and join checks). */
export function referencedFields(query: VisualQuery): string[] {
  const refs = new Set<string>();
  for (const condition of flattenConditions(query.filters)) refs.add(condition.field);
  for (const ref of query.select) refs.add(ref);
  for (const ref of query.groupBy) refs.add(ref);
  for (const agg of query.aggregations) if (agg.field) refs.add(agg.field);
  for (const sort of query.sort) if (sort.key.includes('.')) refs.add(sort.key);
  if (query.timeWindow) refs.add(query.timeWindow.field);
  return [...refs];
}

/** Remove the blocks that reference an entity that is no longer joined. */
export function pruneEntity(query: VisualQuery, entity: EntityName): VisualQuery {
  const keep = (ref: string | null) => !ref || !ref.startsWith(`${entity}.`);
  const pruneGroup = (group: FilterGroup): FilterGroup => ({
    ...group,
    children: group.children
      .filter((child) => child.kind === 'group' || keep(child.field))
      .map((child) => (child.kind === 'group' ? pruneGroup(child) : child)),
  });
  const aliases = new Set(query.aggregations.filter((agg) => !keep(agg.field)).map((agg) => agg.alias));
  return {
    ...query,
    joins: query.joins.filter((join) => join.entity !== entity),
    filters: pruneGroup(query.filters),
    select: query.select.filter(keep),
    groupBy: query.groupBy.filter(keep),
    aggregations: query.aggregations.filter((agg) => keep(agg.field)),
    sort: query.sort.filter((sort) => keep(sort.key) && !aliases.has(sort.key)),
    timeWindow: query.timeWindow && keep(query.timeWindow.field) ? query.timeWindow : null,
  };
}

/** Default alias, unique among the query's existing aliases. */
export function defaultAlias(fn: AggregationFn, field: string | null, existing: readonly string[]): string {
  const base = field ? `${fn}_${field.split('.').pop()}` : fn;
  let alias = base;
  let suffix = 2;
  while (existing.includes(alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  return alias;
}

// ─── pure tree / list editing (used by the composer, covered by tests) ──────

export function mapFilterNode(
  group: FilterGroup,
  id: string,
  update: (node: FilterNode) => FilterNode,
): FilterGroup {
  if (group.id === id) {
    const next = update(group);
    return next.kind === 'group' ? next : group;
  }
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.id === id) return update(child);
      return child.kind === 'group' ? mapFilterNode(child, id, update) : child;
    }),
  };
}

export function removeFilterNode(group: FilterGroup, id: string): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((child) => child.id !== id)
      .map((child) => (child.kind === 'group' ? removeFilterNode(child, id) : child)),
  };
}

export function appendFilterNode(group: FilterGroup, parentId: string, node: FilterNode): FilterGroup {
  return mapFilterNode(group, parentId, (target) =>
    target.kind === 'group' ? { ...target, children: [...target.children, node] } : target,
  );
}

/** Move an item one step within a list (keyboard alternative to drag/drop). */
export function moveItem<T extends { id: string }>(items: readonly T[], id: string, delta: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Reasonable starting value when a condition is created or its operator changes. */
export function defaultValueFor(type: FieldType, op: OperatorId, enumValues?: readonly string[]): ConditionValue {
  if (op === 'is_null' || op === 'not_null') return null;
  const scalar: Literal =
    type === 'number' || type === 'timestamp' ? 0 : type === 'boolean' ? true : (enumValues?.[0] ?? '');
  if (op === 'in' || op === 'not_in') return [scalar];
  if (op === 'between') return [scalar, scalar];
  return scalar;
}
