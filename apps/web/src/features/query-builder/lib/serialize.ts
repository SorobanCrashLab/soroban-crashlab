/**
 * Deterministic serialization for visual queries (#2339).
 *
 * - `canonicalQuery` strips UI ids, sorts object keys and set-like value
 *   lists, so equal queries produce identical bytes.
 * - `parseQueryJson` is the inverse: it validates shape with zod and assigns
 *   ids by traversal order, so `parse(serialize(q))` re-serializes identically
 *   (visual ↔ JSON parity, asserted in the tests).
 * - `toDsl` renders the read-only SQL-like view of the same model.
 */

import { z } from 'zod';
import {
  AGGREGATIONS,
  ENTITY_NAMES,
  OPERATOR_LABELS,
  type Literal,
  type OperatorId,
} from './schema';
import {
  DEFAULT_LIMIT,
  QUERY_VERSION,
  TIME_PRESET_MS,
  isParamRef,
  type ConditionValue,
  type FilterGroup,
  type FilterNode,
  type VisualQuery,
} from './model';

const OPERATOR_IDS = Object.keys(OPERATOR_LABELS) as [OperatorId, ...OperatorId[]];
const literal = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
const conditionValue = z.union([
  literal,
  z.array(literal).max(100),
  z.object({ param: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/i) }).strict(),
  z.null(),
]);

type RawNode =
  | { kind: 'condition'; field: string; op: OperatorId; value: ConditionValue }
  | { kind: 'group'; combinator: 'and' | 'or'; negate?: boolean; children: RawNode[] };

const rawNode: z.ZodType<RawNode> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.literal('condition'),
        field: z.string().max(80),
        op: z.enum(OPERATOR_IDS),
        value: conditionValue,
      })
      .strict(),
    z
      .object({
        kind: z.literal('group'),
        combinator: z.enum(['and', 'or']),
        negate: z.boolean().optional(),
        children: z.array(rawNode).max(50),
      })
      .strict(),
  ]),
);

const fieldRefSchema = z.string().max(80);

export const canonicalQuerySchema = z
  .object({
    version: z.literal(QUERY_VERSION),
    source: z.enum(ENTITY_NAMES),
    joins: z
      .array(
        z
          .object({
            relation: z.string().max(60),
            entity: z.enum(ENTITY_NAMES),
            kind: z.enum(['inner', 'left']),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    filters: rawNode.default({ kind: 'group', combinator: 'and', children: [] }),
    timeWindow: z
      .object({
        field: fieldRefSchema,
        preset: z.enum(['all', 'last_1h', 'last_24h', 'last_7d', 'last_30d', 'custom']),
        from: z.number().finite().nullable().default(null),
        to: z.number().finite().nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
    select: z.array(fieldRefSchema).max(40).default([]),
    groupBy: z.array(fieldRefSchema).max(6).default([]),
    aggregations: z
      .array(
        z
          .object({
            fn: z.enum(AGGREGATIONS as unknown as [string, ...string[]]),
            field: fieldRefSchema.nullable().default(null),
            alias: z.string().regex(/^[a-z_][a-z0-9_]{0,39}$/i),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    sort: z
      .array(z.object({ key: z.string().max(80), direction: z.enum(['asc', 'desc']) }).strict())
      .max(6)
      .default([]),
    limit: z.number().int().min(1).max(10_000).default(DEFAULT_LIMIT),
    params: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/i),
            type: z.enum(['string', 'number', 'boolean', 'timestamp']),
            defaultValue: literal.nullable().default(null),
            description: z.string().max(200).default(''),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();

function sortedValue(value: ConditionValue, op: OperatorId): ConditionValue {
  if (!Array.isArray(value) || (op !== 'in' && op !== 'not_in')) return value;
  // Set semantics: order is not meaningful, so it must not affect the bytes.
  return [...new Set(value)].sort((a, b) => String(a).localeCompare(String(b)));
}

function canonicalNode(node: FilterNode): RawNode {
  if (node.kind === 'condition') {
    return { kind: 'condition', field: node.field, op: node.op, value: sortedValue(node.value, node.op) };
  }
  return {
    kind: 'group',
    combinator: node.combinator,
    negate: node.negate,
    children: node.children.map(canonicalNode),
  };
}

/** Plain object without UI ids. Field order follows the schema. */
export function canonicalQuery(query: VisualQuery): z.input<typeof canonicalQuerySchema> {
  return {
    version: QUERY_VERSION,
    source: query.source,
    joins: query.joins.map(({ relation, entity, kind }) => ({ relation, entity, kind })),
    filters: canonicalNode(query.filters),
    timeWindow: query.timeWindow
      ? {
          field: query.timeWindow.field,
          preset: query.timeWindow.preset,
          from: query.timeWindow.preset === 'custom' ? query.timeWindow.from : null,
          to: query.timeWindow.preset === 'custom' ? query.timeWindow.to : null,
        }
      : null,
    select: [...query.select],
    groupBy: [...query.groupBy],
    aggregations: query.aggregations.map(({ fn, field, alias }) => ({ fn, field, alias })),
    sort: query.sort.map(({ key, direction }) => ({ key, direction })),
    limit: query.limit,
    params: query.params.map((param) => ({ ...param })),
  };
}

/** JSON with recursively sorted keys. */
export function stableStringify(value: unknown, indent?: number): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, normalize((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value), null, indent);
}

export function serializeQuery(query: VisualQuery, indent?: number): string {
  return stableStringify(canonicalQuery(query), indent);
}

/** 64-bit FNV-1a over the canonical bytes, as 16 hex chars. Sync and browser-safe. */
export function queryFingerprint(query: VisualQuery): string {
  const text = serializeQuery(query);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export type ParseResult = { ok: true; query: VisualQuery } | { ok: false; errors: string[] };

/** Parse canonical (or hand-edited) JSON back into the visual model. */
export function parseQueryJson(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      return { ok: false, errors: [`Invalid JSON: ${(error as Error).message}`] };
    }
  }
  const parsed = canonicalQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const data = parsed.data;
  let counter = 0;
  const id = (prefix: string) => `${prefix}-${(counter += 1)}`;
  const toNode = (node: RawNode): FilterNode =>
    node.kind === 'condition'
      ? { id: id('cond'), kind: 'condition', field: node.field, op: node.op, value: node.value }
      : {
          id: id('group'),
          kind: 'group',
          combinator: node.combinator,
          negate: node.negate ?? false,
          children: node.children.map(toNode),
        };
  const rootNode = toNode(data.filters);
  const filters: FilterGroup =
    rootNode.kind === 'group'
      ? { ...rootNode, id: 'root' }
      : { id: 'root', kind: 'group', combinator: 'and', negate: false, children: [rootNode] };
  return {
    ok: true,
    query: {
      version: QUERY_VERSION,
      source: data.source,
      joins: data.joins.map((join) => ({ ...join, id: id('join') })),
      filters,
      timeWindow: data.timeWindow,
      select: data.select,
      groupBy: data.groupBy,
      aggregations: data.aggregations.map((agg) => ({
        id: id('agg'),
        fn: agg.fn as VisualQuery['aggregations'][number]['fn'],
        field: agg.field,
        alias: agg.alias,
      })),
      sort: data.sort.map((sort) => ({ ...sort, id: id('sort') })),
      limit: data.limit,
      params: data.params,
    },
  };
}

// ─── SQL-like DSL (read-only rendering) ─────────────────────────────────────

function quote(value: Literal): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  return String(value);
}

function renderValue(value: ConditionValue): string {
  if (value === null) return 'NULL';
  if (isParamRef(value)) return `:${value.param}`;
  if (Array.isArray(value)) return `(${value.map(quote).join(', ')})`;
  return quote(value);
}

function renderCondition(field: string, op: OperatorId, value: ConditionValue): string {
  switch (op) {
    case 'eq':
      return `${field} = ${renderValue(value)}`;
    case 'neq':
      return `${field} <> ${renderValue(value)}`;
    case 'gt':
      return `${field} > ${renderValue(value)}`;
    case 'gte':
      return `${field} >= ${renderValue(value)}`;
    case 'lt':
      return `${field} < ${renderValue(value)}`;
    case 'lte':
      return `${field} <= ${renderValue(value)}`;
    case 'between': {
      const [low, high] = Array.isArray(value) ? value : [value, value];
      return `${field} BETWEEN ${renderValue((low ?? null) as ConditionValue)} AND ${renderValue((high ?? null) as ConditionValue)}`;
    }
    case 'in':
      return `${field} IN ${renderValue(value)}`;
    case 'not_in':
      return `${field} NOT IN ${renderValue(value)}`;
    case 'contains':
      return `${field} CONTAINS ${renderValue(value)}`;
    case 'starts_with':
      return `${field} STARTS WITH ${renderValue(value)}`;
    case 'is_null':
      return `${field} IS NULL`;
    case 'not_null':
      return `${field} IS NOT NULL`;
  }
}

function renderGroup(group: FilterGroup, depth: number): string | null {
  const parts = group.children
    .map((child) =>
      child.kind === 'condition' ? renderCondition(child.field, child.op, sortedValue(child.value, child.op)) : renderGroup(child, depth + 1),
    )
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  const joined = parts.join(` ${group.combinator.toUpperCase()} `);
  const wrapped = depth > 0 || group.negate ? `(${joined})` : joined;
  return group.negate ? `NOT ${wrapped}` : wrapped;
}

export function toDsl(query: VisualQuery): string {
  const lines: string[] = [];
  const projections = query.groupBy.length > 0 || query.aggregations.length > 0
    ? [
        ...query.groupBy,
        ...query.aggregations.map((agg) =>
          `${agg.fn === 'count_distinct' ? 'count(DISTINCT ' : `${agg.fn}(`}${agg.field ?? '*'}) AS ${agg.alias}`,
        ),
      ]
    : query.select.length > 0
      ? query.select
      : ['*'];
  lines.push(`SELECT ${projections.join(', ')}`);
  lines.push(`FROM ${query.source}`);
  for (const join of query.joins) {
    lines.push(`${join.kind === 'left' ? 'LEFT JOIN' : 'JOIN'} ${join.entity} VIA ${join.relation}`);
  }
  const where = renderGroup(query.filters, 0);
  if (where) lines.push(`WHERE ${where}`);
  const window = query.timeWindow;
  if (window && window.preset === 'custom') {
    lines.push(`WINDOW ${window.field} FROM ${window.from ?? '-inf'} TO ${window.to ?? 'now'}`);
  } else if (window) {
    const preset = window.preset;
    if (preset !== 'all' && preset !== 'custom') {
      lines.push(`WINDOW ${window.field} LAST ${TIME_PRESET_MS[preset] / 3_600_000}h`);
    }
  }
  if (query.groupBy.length > 0) lines.push(`GROUP BY ${query.groupBy.join(', ')}`);
  if (query.sort.length > 0) {
    lines.push(`ORDER BY ${query.sort.map((sort) => `${sort.key} ${sort.direction.toUpperCase()}`).join(', ')}`);
  }
  lines.push(`LIMIT ${query.limit}`);
  if (query.params.length > 0) {
    lines.push(
      `-- params: ${query.params
        .map((param) => `:${param.name} ${param.type}${param.defaultValue !== null ? ` = ${quote(param.defaultValue)}` : ''}`)
        .join(', ')}`,
    );
  }
  return lines.join('\n');
}

// ─── share links ────────────────────────────────────────────────────────────

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** URL-safe token for `?q=`. Carries no data, only the query definition. */
export function encodeShareToken(query: VisualQuery): string {
  return toBase64Url(serializeQuery(query));
}

export function decodeShareToken(token: string): ParseResult {
  if (token.length > 8_000) return { ok: false, errors: ['Shared query is too large.'] };
  try {
    return parseQueryJson(fromBase64Url(token));
  } catch {
    return { ok: false, errors: ['Shared query token is not valid base64url.'] };
  }
}
