/**
 * AST types for the composable query builder (#2194).
 *
 * The filter AST is a tree of conditions and groups. The root is always an
 * AND group. Groups can be nested to arbitrary depth, enabling expressions
 * like: AND(status=crashed, OR(error.type=Reentrancy, error.type=Overflow)).
 */

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists';

export type FilterFieldType = 'string' | 'number' | 'enum' | 'boolean' | 'date';

export interface FilterField {
  name: string;
  label: string;
  type: FilterFieldType;
  operators: FilterOperator[];
  enumValues?: string[];
}

/** Unique id generator for AST nodes — stable enough for client-only use. */
let nodeCounter = 0;
export function generateNodeId(): string {
  nodeCounter += 1;
  return `n${Date.now().toString(36)}_${nodeCounter}`;
}

export interface FilterCondition {
  id: string;
  type: 'condition';
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | string[];
}

export type FilterGroupType = 'and' | 'or';

export interface FilterGroup {
  id: string;
  type: 'group';
  groupType: FilterGroupType;
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

/** The root AST node is always a group. */
export type FilterAST = FilterGroup;

export function isCondition(node: FilterNode): node is FilterCondition {
  return node.type === 'condition';
}

export function isGroup(node: FilterNode): node is FilterGroup {
  return node.type === 'group';
}

export function createCondition(
  field: string,
  operator: FilterOperator,
  value: string | number | boolean | string[] = '',
): FilterCondition {
  return { id: generateNodeId(), type: 'condition', field, operator, value };
}

export function createGroup(
  groupType: FilterGroupType = 'and',
  children: FilterNode[] = [],
): FilterGroup {
  return { id: generateNodeId(), type: 'group', groupType, children };
}

/** Create an empty root AST — a single AND group with no children. */
export function createEmptyAST(): FilterAST {
  return createGroup('and');
}

/**
 * Schema of filterable fields, derived from FuzzingRun shape.
 * Operators are restricted per field type for the UI dropdown.
 */
export const FILTER_FIELDS: FilterField[] = [
  {
    name: 'status',
    label: 'Status',
    type: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    enumValues: ['queued', 'running', 'completed', 'crashed', 'cancelled', 'timed_out', 'partial'],
  },
  {
    name: 'area',
    label: 'Area',
    type: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    enumValues: ['auth', 'state', 'budget', 'xdr'],
  },
  {
    name: 'severity',
    label: 'Severity',
    type: 'enum',
    operators: ['eq', 'neq', 'in', 'not_in'],
    enumValues: ['low', 'medium', 'high', 'critical'],
  },
  {
    name: 'duration',
    label: 'Duration',
    type: 'number',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  },
  {
    name: 'seedCount',
    label: 'Seed Count',
    type: 'number',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  },
  {
    name: 'id',
    label: 'Run ID',
    type: 'string',
    operators: ['eq', 'neq', 'contains', 'not_contains'],
  },
  {
    name: 'hasCrash',
    label: 'Has Crash',
    type: 'boolean',
    operators: ['eq'],
  },
  {
    name: 'queuedAt',
    label: 'Queued At',
    type: 'date',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  },
  {
    name: 'startedAt',
    label: 'Started At',
    type: 'date',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  },
  {
    name: 'finishedAt',
    label: 'Finished At',
    type: 'date',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  },
];

export const FIELD_MAP: Record<string, FilterField> = Object.fromEntries(
  FILTER_FIELDS.map((f) => [f.name, f]),
);

/** Get the label for an operator for display. */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: '=',
  neq: '≠',
  in: 'in',
  not_in: 'not in',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contains',
  not_contains: 'not contains',
  exists: 'exists',
  not_exists: 'not exists',
};
