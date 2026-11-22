/**
 * Searchable field whitelist (#1432), enumerated from the run schema.
 *
 * Unknown fields are an error rather than a silently ignored term: a typo that
 * quietly widens the result set is worse than one that says so.
 */

export type FieldKind = 'string' | 'enum' | 'number' | 'date' | 'boolean';

export interface FieldSpec {
  name: string;
  kind: FieldKind;
  /** Allowed values for enum fields, used for validation and hints. */
  values?: readonly string[];
  description: string;
}

export const SEARCH_FIELDS: readonly FieldSpec[] = [
  { name: 'id', kind: 'string', description: 'Run identifier' },
  {
    name: 'status',
    kind: 'enum',
    values: ['running', 'completed', 'failed', 'cancelled'],
    description: 'Run status',
  },
  {
    name: 'area',
    kind: 'enum',
    values: ['auth', 'state', 'budget', 'xdr'],
    description: 'Product area',
  },
  {
    name: 'severity',
    kind: 'enum',
    values: ['low', 'medium', 'high', 'critical'],
    description: 'Highest observed severity',
  },
  { name: 'duration', kind: 'number', description: 'Elapsed milliseconds' },
  { name: 'seeds', kind: 'number', description: 'Seed count' },
  { name: 'cpu', kind: 'number', description: 'CPU instructions' },
  { name: 'memory', kind: 'number', description: 'Memory bytes' },
  { name: 'fee', kind: 'number', description: 'Minimum resource fee' },
  { name: 'queued', kind: 'date', description: 'Queued timestamp (ISO date)' },
  { name: 'started', kind: 'date', description: 'Start timestamp (ISO date)' },
  { name: 'finished', kind: 'date', description: 'Finish timestamp (ISO date)' },
  { name: 'tag', kind: 'string', description: 'Any attached tag' },
  { name: 'crash', kind: 'boolean', description: 'Whether the run produced a crash' },
  { name: 'category', kind: 'string', description: 'Crash failure category' },
  { name: 'signature', kind: 'string', description: 'Crash signature' },
];

const BY_NAME = new Map(SEARCH_FIELDS.map((field) => [field.name, field]));

export function findField(name: string): FieldSpec | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export function fieldNames(): string[] {
  return SEARCH_FIELDS.map((field) => field.name);
}

/**
 * Field names starting with `prefix`, for the autocomplete hint list. Sorted
 * by name so the dropdown order does not depend on declaration order.
 */
export function suggestFields(prefix: string): FieldSpec[] {
  const needle = prefix.trim().toLowerCase();
  const matches = needle
    ? SEARCH_FIELDS.filter((field) => field.name.startsWith(needle))
    : [...SEARCH_FIELDS];
  return matches.sort((a, b) => a.name.localeCompare(b.name));
}

/** ISO-8601 only in v1; natural-language dates are explicitly out of scope. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
