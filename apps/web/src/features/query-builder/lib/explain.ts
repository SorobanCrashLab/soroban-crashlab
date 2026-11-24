/**
 * Explain plan, cost estimate and performance hints (#2339).
 *
 * Pure and cheap: it reads only dataset row counts, so the preview pane can
 * recompute it on every keystroke without touching the server.
 */

import { ENTITIES, findRelation, getField, type EntityName } from './schema';
import { flattenConditions, isAggregateQuery, type VisualQuery } from './model';
import { DEFAULT_LIMITS } from './engine';

export type DatasetStats = Partial<Record<EntityName, { rows: number }>>;

export interface PlanStep {
  op: 'scan' | 'join' | 'window' | 'filter' | 'aggregate' | 'project' | 'sort' | 'limit';
  detail: string;
  estimatedRows: number;
}

export type CostClass = 'low' | 'medium' | 'high';

export interface ExplainResult {
  steps: PlanStep[];
  estimatedScanRows: number;
  estimatedOutputRows: number;
  costUnits: number;
  costClass: CostClass;
  hints: string[];
  /** True when the estimate already exceeds a guardrail. */
  exceedsGuardrail: boolean;
}

const LARGE_CORPORA: readonly EntityName[] = ['logs', 'traces', 'metrics'];

function selectivity(op: string): number {
  switch (op) {
    case 'eq':
    case 'in':
      return 0.2;
    case 'starts_with':
    case 'contains':
      return 0.3;
    case 'is_null':
      return 0.1;
    default:
      return 0.5;
  }
}

export function explainQuery(query: VisualQuery, stats: DatasetStats): ExplainResult {
  const count = (entity: EntityName) => stats[entity]?.rows ?? 0;
  const steps: PlanStep[] = [];
  const hints: string[] = [];

  let rows = count(query.source);
  let scan = rows;
  steps.push({ op: 'scan', detail: `${query.source} (${rows.toLocaleString('en-US')} rows)`, estimatedRows: rows });

  for (const join of query.joins) {
    const relation = findRelation(join.relation);
    const right = count(join.entity);
    scan += right;
    const forward = relation?.to === join.entity;
    const oneToMany = relation ? (forward ? relation.cardinality === 'one-to-many' : relation.cardinality === 'many-to-one') : false;
    const leftEntity = relation ? (forward ? relation.from : relation.to) : query.source;
    const fanout = oneToMany ? Math.max(1, right / Math.max(1, count(leftEntity))) : 1;
    rows = Math.round(rows * fanout);
    steps.push({
      op: 'join',
      detail: `${join.kind} join ${join.entity} via ${join.relation}${oneToMany ? ` (≈${fanout.toFixed(1)}× fan-out)` : ''}`,
      estimatedRows: rows,
    });
  }
  const joinedRows = rows;

  if (query.timeWindow && query.timeWindow.preset !== 'all') {
    const fraction = { last_1h: 0.05, last_24h: 0.2, last_7d: 0.5, last_30d: 0.8, custom: 0.5 }[query.timeWindow.preset];
    rows = Math.round(rows * fraction);
    steps.push({ op: 'window', detail: `${query.timeWindow.field} ${query.timeWindow.preset}`, estimatedRows: rows });
  }

  const conditions = flattenConditions(query.filters);
  if (conditions.length > 0) {
    const factor = query.filters.combinator === 'and'
      ? conditions.reduce((acc, condition) => acc * selectivity(condition.op), 1)
      : Math.min(1, conditions.reduce((acc, condition) => acc + selectivity(condition.op), 0));
    rows = Math.max(conditions.length > 0 ? 1 : 0, Math.round(rows * factor));
    steps.push({ op: 'filter', detail: `${conditions.length} condition(s)`, estimatedRows: rows });
  }

  if (isAggregateQuery(query)) {
    let groups = 1;
    for (const ref of query.groupBy) {
      const field = getField(ref);
      groups *= field?.enumValues?.length ?? Math.min(rows, 50);
      if (field && ENTITIES[field.entity].primaryKey === field.name) {
        hints.push(`Grouping by ${ref} (a primary key) produces one group per row; consider a coarser field.`);
      }
    }
    rows = Math.min(rows, groups);
    steps.push({
      op: 'aggregate',
      detail: `${query.aggregations.map((agg) => `${agg.fn}(${agg.field ?? '*'})`).join(', ') || 'distinct'} by ${
        query.groupBy.join(', ') || '(all rows)'
      }`,
      estimatedRows: rows,
    });
  } else {
    steps.push({ op: 'project', detail: query.select.length > 0 ? query.select.join(', ') : 'default columns', estimatedRows: rows });
  }

  if (query.sort.length > 0) {
    steps.push({ op: 'sort', detail: query.sort.map((sort) => `${sort.key} ${sort.direction}`).join(', '), estimatedRows: rows });
  }
  rows = Math.min(rows, query.limit);
  steps.push({ op: 'limit', detail: String(query.limit), estimatedRows: rows });

  const present = [query.source, ...query.joins.map((join) => join.entity)];
  for (const entity of present) {
    if (LARGE_CORPORA.includes(entity) && (!query.timeWindow || query.timeWindow.preset === 'all')) {
      hints.push(`Add a time window: ${entity} is a large corpus and is scanned in full without one.`);
    }
  }
  if (query.joins.length > 0 && conditions.length === 0) {
    hints.push('Joins without filters multiply rows; filter the source first to keep the fan-out small.');
  }
  if (!isAggregateQuery(query) && query.limit > 500) {
    hints.push('Large row sets are slow to scan visually; aggregate or lower the limit.');
  }

  const costUnits = scan + joinedRows;
  const costClass: CostClass = costUnits < 5_000 ? 'low' : costUnits < 50_000 ? 'medium' : 'high';
  const exceedsGuardrail =
    scan > DEFAULT_LIMITS.maxScanRows || joinedRows > DEFAULT_LIMITS.maxIntermediateRows;
  if (exceedsGuardrail) {
    hints.unshift('Estimated work exceeds the execution guardrails; the result will be partial.');
  }

  return {
    steps,
    estimatedScanRows: scan,
    estimatedOutputRows: rows,
    costUnits,
    costClass,
    hints: [...new Set(hints)],
    exceedsGuardrail,
  };
}
