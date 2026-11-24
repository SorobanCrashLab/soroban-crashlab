/**
 * Schema-aware validation and parameter binding (#2339).
 *
 * Errors block execution; warnings are shown next to the block they refer to
 * but still run. The server re-runs the same validation with the caller's
 * role, so the client check is a convenience, never the boundary.
 */

import {
  AGGREGATION_TYPES,
  ENTITIES,
  OPERATORS_BY_TYPE,
  findRelation,
  getField,
  type FieldDefinition,
  type Literal,
} from './schema';
import {
  MAX_LIMIT,
  flattenConditions,
  isAggregateQuery,
  isParamRef,
  type ConditionValue,
  type FilterCondition,
  type FilterGroup,
  type QueryParam,
  type VisualQuery,
} from './model';

export const MAX_JOINS = 3;

export type ViewerRole = 'anonymous' | 'analyst' | 'maintainer';

export interface ValidationIssue {
  /** Which block the issue belongs to, for inline display. */
  path: string;
  blockId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function canSeeRestricted(role: ViewerRole): boolean {
  return role === 'maintainer';
}

function literalMatches(field: FieldDefinition, value: Literal): boolean {
  switch (field.type) {
    case 'number':
    case 'timestamp':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
    case 'enum':
      return typeof value === 'string';
  }
}

function paramMatches(field: FieldDefinition, param: QueryParam): boolean {
  if (field.type === 'enum') return param.type === 'string';
  if (field.type === 'timestamp') return param.type === 'timestamp' || param.type === 'number';
  return param.type === field.type;
}

function checkCondition(
  condition: FilterCondition,
  query: VisualQuery,
  role: ViewerRole,
  present: Set<string>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
) {
  const path = `filters.${condition.id}`;
  const field = getField(condition.field);
  if (!field) {
    errors.push({ path, blockId: condition.id, message: `Unknown field ${condition.field}.` });
    return;
  }
  if (!present.has(field.entity)) {
    errors.push({
      path,
      blockId: condition.id,
      message: `${condition.field} belongs to ${field.entity}, which is not joined.`,
    });
  }
  if (field.restricted && !canSeeRestricted(role)) {
    errors.push({
      path,
      blockId: condition.id,
      message: `${condition.field} is restricted; filtering on it requires the maintainer role.`,
    });
  }
  const operators = OPERATORS_BY_TYPE[field.type];
  if (!operators.includes(condition.op)) {
    errors.push({
      path,
      blockId: condition.id,
      message: `Operator ${condition.op} is not valid for ${field.type} field ${condition.field}.`,
    });
    return;
  }

  const value: ConditionValue = condition.value;
  if (condition.op === 'is_null' || condition.op === 'not_null') {
    if (value !== null) {
      warnings.push({ path, blockId: condition.id, message: 'Value is ignored for empty/not-empty checks.' });
    }
    return;
  }
  if (isParamRef(value)) {
    const param = query.params.find((candidate) => candidate.name === value.param);
    if (!param) {
      errors.push({ path, blockId: condition.id, message: `Parameter :${value.param} is not declared.` });
    } else if (!paramMatches(field, param)) {
      errors.push({
        path,
        blockId: condition.id,
        message: `Parameter :${param.name} is ${param.type} but ${condition.field} is ${field.type}.`,
      });
    }
    return;
  }
  if (value === null) {
    errors.push({ path, blockId: condition.id, message: `${condition.field} needs a value.` });
    return;
  }

  if (condition.op === 'in' || condition.op === 'not_in') {
    if (!Array.isArray(value) || value.length === 0) {
      errors.push({ path, blockId: condition.id, message: 'Choose at least one value.' });
      return;
    }
  } else if (condition.op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) {
      errors.push({ path, blockId: condition.id, message: 'Between needs a lower and an upper bound.' });
      return;
    }
    if (typeof value[0] === 'number' && typeof value[1] === 'number' && value[0] > value[1]) {
      errors.push({ path, blockId: condition.id, message: 'Lower bound is greater than upper bound.' });
    }
  } else if (Array.isArray(value)) {
    errors.push({ path, blockId: condition.id, message: `Operator ${condition.op} takes a single value.` });
    return;
  }

  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (!literalMatches(field, item)) {
      errors.push({
        path,
        blockId: condition.id,
        message: `${JSON.stringify(item)} is not a valid ${field.type} for ${condition.field}.`,
      });
      return;
    }
    if (field.enumValues && typeof item === 'string' && !field.enumValues.includes(item)) {
      warnings.push({
        path,
        blockId: condition.id,
        message: `${item} is not a known ${condition.field} value (${field.enumValues.join(', ')}).`,
      });
    }
  }
}

function checkEmptyGroups(group: FilterGroup, warnings: ValidationIssue[], isRoot: boolean) {
  if (!isRoot && group.children.length === 0) {
    warnings.push({ path: `filters.${group.id}`, blockId: group.id, message: 'Empty group has no effect.' });
  }
  for (const child of group.children) if (child.kind === 'group') checkEmptyGroups(child, warnings, false);
}

export function validateQuery(query: VisualQuery, role: ViewerRole = 'analyst'): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Joins must follow a declared relation from an entity already present.
  const present = new Set<string>([query.source]);
  if (query.joins.length > MAX_JOINS) {
    errors.push({ path: 'joins', message: `At most ${MAX_JOINS} joins are allowed.` });
  }
  for (const join of query.joins) {
    const relation = findRelation(join.relation);
    const path = `joins.${join.id}`;
    if (!relation) {
      errors.push({ path, blockId: join.id, message: `Unknown relation ${join.relation}.` });
      continue;
    }
    const connects =
      (relation.to === join.entity && present.has(relation.from)) ||
      (relation.from === join.entity && present.has(relation.to));
    if (!connects) {
      errors.push({
        path,
        blockId: join.id,
        message: `${relation.id} does not connect ${join.entity} to ${[...present].join(', ')}.`,
      });
    }
    if (present.has(join.entity)) {
      errors.push({ path, blockId: join.id, message: `${join.entity} is already part of the query.` });
    }
    present.add(join.entity);
  }

  const canSee = canSeeRestricted(role);
  const checkRef = (ref: string, path: string, usage: 'project' | 'compute', blockId?: string) => {
    const field = getField(ref);
    if (!field) {
      errors.push({ path, blockId, message: `Unknown field ${ref}.` });
      return null;
    }
    if (!present.has(field.entity)) {
      errors.push({ path, blockId, message: `${ref} belongs to ${field.entity}, which is not joined.` });
    }
    if (field.restricted && !canSee) {
      if (usage === 'compute') {
        errors.push({ path, blockId, message: `${ref} is restricted and cannot be grouped, sorted or aggregated.` });
      } else {
        warnings.push({ path, blockId, message: `${ref} is restricted and will be redacted in results.` });
      }
    }
    return field;
  };

  for (const condition of flattenConditions(query.filters)) {
    checkCondition(condition, query, role, present, errors, warnings);
  }
  checkEmptyGroups(query.filters, warnings, true);

  for (const ref of query.select) checkRef(ref, `select.${ref}`, 'project');
  for (const ref of query.groupBy) checkRef(ref, `groupBy.${ref}`, 'compute');

  const aliases = new Set<string>();
  for (const agg of query.aggregations) {
    const path = `aggregations.${agg.id}`;
    if (aliases.has(agg.alias)) {
      errors.push({ path, blockId: agg.id, message: `Alias ${agg.alias} is used twice.` });
    }
    aliases.add(agg.alias);
    if (!agg.field) {
      if (agg.fn !== 'count') {
        errors.push({ path, blockId: agg.id, message: `${agg.fn} needs a field.` });
      }
      continue;
    }
    const field = checkRef(agg.field, path, agg.fn === 'count' ? 'project' : 'compute', agg.id);
    if (field && !AGGREGATION_TYPES[agg.fn].includes(field.type)) {
      errors.push({
        path,
        blockId: agg.id,
        message: `${agg.fn} needs a ${AGGREGATION_TYPES[agg.fn].join(' or ')} field; ${agg.field} is ${field.type}.`,
      });
    }
  }

  const aggregate = isAggregateQuery(query);
  if (aggregate && query.select.length > 0) {
    warnings.push({ path: 'select', message: 'Selected columns are ignored when grouping or aggregating.' });
  }
  for (const sort of query.sort) {
    const path = `sort.${sort.id}`;
    if (aliases.has(sort.key)) continue;
    if (aggregate && !query.groupBy.includes(sort.key)) {
      errors.push({
        path,
        blockId: sort.id,
        message: `Aggregated results can only be sorted by a group-by field or an aggregation alias.`,
      });
      continue;
    }
    checkRef(sort.key, path, 'compute', sort.id);
  }

  if (query.timeWindow) {
    const field = checkRef(query.timeWindow.field, 'timeWindow', 'compute');
    if (field && field.type !== 'timestamp') {
      errors.push({ path: 'timeWindow', message: `${query.timeWindow.field} is not a timestamp field.` });
    }
    if (query.timeWindow.preset === 'custom') {
      const { from, to } = query.timeWindow;
      if (from === null && to === null) {
        errors.push({ path: 'timeWindow', message: 'A custom window needs a start or an end.' });
      } else if (from !== null && to !== null && from > to) {
        errors.push({ path: 'timeWindow', message: 'Window start is after its end.' });
      }
    }
  }

  if (!Number.isInteger(query.limit) || query.limit < 1) {
    errors.push({ path: 'limit', message: 'Limit must be a positive integer.' });
  } else if (query.limit > MAX_LIMIT) {
    errors.push({ path: 'limit', message: `Limit is capped at ${MAX_LIMIT} rows; export in pages instead.` });
  }

  const names = new Set<string>();
  const used = new Set(
    flattenConditions(query.filters)
      .map((condition) => (isParamRef(condition.value) ? condition.value.param : null))
      .filter((name): name is string => name !== null),
  );
  for (const param of query.params) {
    if (names.has(param.name)) errors.push({ path: `params.${param.name}`, message: `Parameter :${param.name} is declared twice.` });
    names.add(param.name);
    if (!used.has(param.name)) warnings.push({ path: `params.${param.name}`, message: `Parameter :${param.name} is not used.` });
  }

  if (!ENTITIES[query.source]) errors.push({ path: 'source', message: `Unknown source ${String(query.source)}.` });

  return { valid: errors.length === 0, errors, warnings };
}

export type ParamValues = Record<string, Literal | null | undefined>;

function coerceParam(param: QueryParam, raw: Literal | null | undefined): Literal | null {
  const value = raw === undefined || raw === '' ? param.defaultValue : raw;
  if (value === null || value === undefined) return null;
  switch (param.type) {
    case 'number':
    case 'timestamp': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && value.trim() !== '') return numeric;
        if (param.type === 'timestamp') {
          const parsed = Date.parse(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
      }
      return null;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return null;
    case 'string':
      return String(value);
  }
}

export type BindResult = { ok: true; query: VisualQuery } | { ok: false; errors: string[] };

/** Substitute `:param` references with typed values (or declared defaults). */
export function bindParams(query: VisualQuery, values: ParamValues = {}): BindResult {
  const errors: string[] = [];
  const resolved = new Map<string, Literal>();
  for (const param of query.params) {
    const value = coerceParam(param, values[param.name]);
    if (value === null) errors.push(`Parameter :${param.name} needs a ${param.type} value.`);
    else resolved.set(param.name, value);
  }
  const bindGroup = (group: FilterGroup): FilterGroup => ({
    ...group,
    children: group.children.map((child) => {
      if (child.kind === 'group') return bindGroup(child);
      if (!isParamRef(child.value)) return child;
      const value = resolved.get(child.value.param);
      if (value === undefined) {
        if (!query.params.some((param) => param.name === (child.value as { param: string }).param)) {
          errors.push(`Parameter :${child.value.param} is not declared.`);
        }
        return child;
      }
      const isList = child.op === 'in' || child.op === 'not_in';
      return { ...child, value: isList ? [value] : value };
    }),
  });
  const bound = { ...query, filters: bindGroup(query.filters) };
  return errors.length > 0 ? { ok: false, errors: [...new Set(errors)] } : { ok: true, query: bound };
}
