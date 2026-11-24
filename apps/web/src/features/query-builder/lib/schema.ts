/**
 * Query-builder schema registry (#2339).
 *
 * One declarative description of every queryable entity, its fields and the
 * relations a visual join may follow. The composer, validator, explain plan,
 * engine and schema browser all read this table, so a field added here shows
 * up everywhere at once and an undeclared field cannot be queried at all.
 *
 * `restricted` fields are redacted for non-maintainers and may not be used in
 * filters, grouping or sorting by them (filtering on a hidden value would
 * leak it one predicate at a time).
 */

export const ENTITY_NAMES = ['runs', 'crashes', 'logs', 'traces', 'metrics', 'ci'] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];

export type FieldType = 'string' | 'number' | 'boolean' | 'timestamp' | 'enum';

export type Literal = string | number | boolean;

export interface FieldDefinition {
  name: string;
  type: FieldType;
  description: string;
  enumValues?: readonly string[];
  samples?: readonly Literal[];
  unit?: string;
  restricted?: boolean;
}

export interface EntityDefinition {
  name: EntityName;
  label: string;
  description: string;
  /** Primary key, used for drill-down and as the default count target. */
  primaryKey: string;
  /** Default timestamp for time windows. */
  timeField: string | null;
  /** Fields projected when the query selects nothing explicitly. */
  defaultSelect: readonly string[];
  fields: readonly FieldDefinition[];
}

export interface RelationDefinition {
  id: string;
  from: EntityName;
  fromField: string;
  to: EntityName;
  toField: string;
  cardinality: 'one-to-many' | 'many-to-one' | 'one-to-one';
  description: string;
}

const RUN_STATUS = ['running', 'completed', 'failed', 'cancelled'] as const;
const AREAS = ['auth', 'state', 'budget', 'xdr'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export const ENTITIES: Record<EntityName, EntityDefinition> = {
  runs: {
    name: 'runs',
    label: 'Runs',
    description: 'Fuzzing runs with status, resource usage and timing.',
    primaryKey: 'id',
    timeField: 'started_at',
    defaultSelect: ['id', 'status', 'area', 'severity', 'duration_ms', 'started_at'],
    fields: [
      { name: 'id', type: 'string', description: 'Run identifier.', samples: ['run-1000', 'run-1001'] },
      { name: 'campaign_id', type: 'string', description: 'Owning campaign.', samples: ['campaign-fixture'] },
      { name: 'status', type: 'enum', description: 'Lifecycle status.', enumValues: RUN_STATUS },
      { name: 'area', type: 'enum', description: 'Failure area under test.', enumValues: AREAS },
      { name: 'severity', type: 'enum', description: 'Highest severity observed.', enumValues: SEVERITIES },
      { name: 'fixture', type: 'string', description: 'Contract::method fixture name.', samples: ['token::transfer'] },
      { name: 'duration_ms', type: 'number', description: 'Wall-clock duration.', unit: 'ms' },
      { name: 'seed_count', type: 'number', description: 'Seeds processed.' },
      { name: 'cpu_instructions', type: 'number', description: 'CPU instructions consumed.' },
      { name: 'memory_bytes', type: 'number', description: 'Peak memory.', unit: 'bytes' },
      { name: 'min_resource_fee', type: 'number', description: 'Minimum simulated resource fee.', unit: 'stroops' },
      { name: 'started_at', type: 'timestamp', description: 'Start time.' },
      { name: 'finished_at', type: 'timestamp', description: 'Finish time (null while running).' },
    ],
  },
  crashes: {
    name: 'crashes',
    label: 'Crashes',
    description: 'Crash signatures extracted from failed runs.',
    primaryKey: 'id',
    timeField: 'detected_at',
    defaultSelect: ['id', 'run_id', 'signature', 'failure_category', 'severity'],
    fields: [
      { name: 'id', type: 'string', description: 'Crash identifier.' },
      { name: 'run_id', type: 'string', description: 'Run that produced the crash.' },
      { name: 'signature', type: 'string', description: 'Normalized crash signature.' },
      { name: 'signature_hash', type: 'number', description: 'Stable FNV-1a signature hash.' },
      { name: 'failure_category', type: 'string', description: 'Failure category.' },
      { name: 'area', type: 'enum', description: 'Failure area.', enumValues: AREAS },
      { name: 'severity', type: 'enum', description: 'Crash severity.', enumValues: SEVERITIES },
      { name: 'detected_at', type: 'timestamp', description: 'When the crash was recorded.' },
      {
        name: 'payload',
        type: 'string',
        description: 'Raw reproducer payload (may contain addresses and arguments).',
        restricted: true,
      },
    ],
  },
  logs: {
    name: 'logs',
    label: 'Logs',
    description: 'Structured log events (bounded recent window of the log corpus).',
    primaryKey: 'id',
    timeField: 'timestamp',
    defaultSelect: ['timestamp', 'level', 'source', 'message', 'run_id'],
    fields: [
      { name: 'id', type: 'string', description: 'Event identifier.' },
      { name: 'timestamp', type: 'timestamp', description: 'Event time.' },
      { name: 'level', type: 'enum', description: 'Log level.', enumValues: ['debug', 'info', 'warn', 'error'] },
      { name: 'source', type: 'string', description: 'Emitting component.', samples: ['rpc', 'fuzz-worker'] },
      { name: 'message', type: 'string', description: 'Message text (inline secrets are always masked).' },
      { name: 'run_id', type: 'string', description: 'Correlated run.' },
      { name: 'campaign_id', type: 'string', description: 'Correlated campaign.' },
      { name: 'trace_id', type: 'string', description: 'Correlated trace.' },
      { name: 'error_code', type: 'string', description: 'Error code, when present.', samples: ['RPC-TIMEOUT'] },
      { name: 'contract', type: 'string', description: 'Contract under test.' },
    ],
  },
  traces: {
    name: 'traces',
    label: 'Traces',
    description: 'Spans recorded for each run phase.',
    primaryKey: 'span_id',
    timeField: 'started_at',
    defaultSelect: ['span_id', 'trace_id', 'run_id', 'name', 'duration_ms', 'status'],
    fields: [
      { name: 'span_id', type: 'string', description: 'Span identifier.' },
      { name: 'trace_id', type: 'string', description: 'Trace identifier.' },
      { name: 'run_id', type: 'string', description: 'Run the span belongs to.' },
      {
        name: 'name',
        type: 'enum',
        description: 'Span operation.',
        enumValues: ['rpc.simulate', 'wasm.execute', 'ledger.apply', 'report.persist'],
      },
      { name: 'service', type: 'string', description: 'Service emitting the span.' },
      { name: 'status', type: 'enum', description: 'Span status.', enumValues: ['ok', 'error'] },
      { name: 'duration_ms', type: 'number', description: 'Span duration.', unit: 'ms' },
      { name: 'started_at', type: 'timestamp', description: 'Span start.' },
    ],
  },
  metrics: {
    name: 'metrics',
    label: 'Metrics',
    description: 'Per-run fuzzing metrics samples.',
    primaryKey: 'id',
    timeField: 'recorded_at',
    defaultSelect: ['run_id', 'metric', 'value', 'recorded_at'],
    fields: [
      { name: 'id', type: 'string', description: 'Sample identifier.' },
      { name: 'run_id', type: 'string', description: 'Run the sample belongs to.' },
      {
        name: 'metric',
        type: 'enum',
        description: 'Metric name.',
        enumValues: ['execs_per_sec', 'coverage_pct', 'corpus_size', 'edges_found'],
      },
      { name: 'value', type: 'number', description: 'Sample value.' },
      { name: 'recorded_at', type: 'timestamp', description: 'Sample time.' },
    ],
  },
  ci: {
    name: 'ci',
    label: 'CI runs',
    description: 'CI workflow runs (latest snapshot from the CI provider).',
    primaryKey: 'id',
    timeField: 'created_at',
    defaultSelect: ['id', 'workflow', 'branch', 'conclusion', 'duration_ms'],
    fields: [
      { name: 'id', type: 'string', description: 'CI run identifier.' },
      { name: 'workflow', type: 'string', description: 'Workflow name.' },
      { name: 'branch', type: 'string', description: 'Head branch.' },
      { name: 'event', type: 'string', description: 'Triggering event.' },
      { name: 'status', type: 'string', description: 'Provider status.' },
      { name: 'conclusion', type: 'string', description: 'Provider conclusion (null while running).' },
      { name: 'attempt', type: 'number', description: 'Attempt number.' },
      { name: 'pr_number', type: 'number', description: 'Pull request number.' },
      { name: 'commit_sha', type: 'string', description: 'Head commit.' },
      { name: 'author', type: 'string', description: 'Commit author handle.', restricted: true },
      { name: 'duration_ms', type: 'number', description: 'Run duration.', unit: 'ms' },
      { name: 'created_at', type: 'timestamp', description: 'Run creation time.' },
    ],
  },
};

export const RELATIONS: readonly RelationDefinition[] = [
  {
    id: 'runs-crashes',
    from: 'runs',
    fromField: 'id',
    to: 'crashes',
    toField: 'run_id',
    cardinality: 'one-to-many',
    description: 'A run can produce crashes.',
  },
  {
    id: 'runs-logs',
    from: 'runs',
    fromField: 'id',
    to: 'logs',
    toField: 'run_id',
    cardinality: 'one-to-many',
    description: 'Log events emitted during a run.',
  },
  {
    id: 'runs-traces',
    from: 'runs',
    fromField: 'id',
    to: 'traces',
    toField: 'run_id',
    cardinality: 'one-to-many',
    description: 'Spans recorded for a run.',
  },
  {
    id: 'runs-metrics',
    from: 'runs',
    fromField: 'id',
    to: 'metrics',
    toField: 'run_id',
    cardinality: 'one-to-many',
    description: 'Metric samples for a run.',
  },
  {
    id: 'traces-logs',
    from: 'traces',
    fromField: 'trace_id',
    to: 'logs',
    toField: 'trace_id',
    cardinality: 'one-to-many',
    description: 'Logs carrying the same trace id.',
  },
];

export function isEntityName(value: unknown): value is EntityName {
  return typeof value === 'string' && (ENTITY_NAMES as readonly string[]).includes(value);
}

/** `runs.status` → `{ entity: 'runs', field: 'status' }`, or null when malformed. */
export function splitFieldRef(ref: string): { entity: EntityName; field: string } | null {
  const dot = ref.indexOf('.');
  if (dot <= 0) return null;
  const entity = ref.slice(0, dot);
  const field = ref.slice(dot + 1);
  if (!isEntityName(entity) || !field) return null;
  return { entity, field };
}

export function fieldRef(entity: EntityName, field: string): string {
  return `${entity}.${field}`;
}

export function getField(ref: string): (FieldDefinition & { entity: EntityName; ref: string }) | null {
  const parts = splitFieldRef(ref);
  if (!parts) return null;
  const field = ENTITIES[parts.entity].fields.find((candidate) => candidate.name === parts.field);
  return field ? { ...field, entity: parts.entity, ref } : null;
}

/**
 * Relations reachable from the entities already in the query, oriented so
 * `from` is the side already present. Relations whose target is already
 * joined are excluded (each entity appears at most once).
 */
export function joinableRelations(present: readonly EntityName[]): Array<RelationDefinition & { reversed: boolean }> {
  const set = new Set(present);
  const out: Array<RelationDefinition & { reversed: boolean }> = [];
  for (const relation of RELATIONS) {
    if (set.has(relation.from) && !set.has(relation.to)) out.push({ ...relation, reversed: false });
    else if (set.has(relation.to) && !set.has(relation.from)) {
      out.push({
        ...relation,
        from: relation.to,
        fromField: relation.toField,
        to: relation.from,
        toField: relation.fromField,
        cardinality:
          relation.cardinality === 'one-to-many'
            ? 'many-to-one'
            : relation.cardinality === 'many-to-one'
              ? 'one-to-many'
              : relation.cardinality,
        reversed: true,
      });
    }
  }
  return out;
}

export function findRelation(id: string): RelationDefinition | null {
  return RELATIONS.find((relation) => relation.id === id) ?? null;
}

export type OperatorId =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'is_null'
  | 'not_null';

export const OPERATOR_LABELS: Record<OperatorId, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  in: 'in',
  not_in: 'not in',
  contains: 'contains',
  starts_with: 'starts with',
  is_null: 'is empty',
  not_null: 'is not empty',
};

export const OPERATORS_BY_TYPE: Record<FieldType, readonly OperatorId[]> = {
  string: ['eq', 'neq', 'contains', 'starts_with', 'in', 'not_in', 'is_null', 'not_null'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'is_null', 'not_null'],
  enum: ['eq', 'neq', 'in', 'not_in', 'is_null', 'not_null'],
  boolean: ['eq', 'is_null', 'not_null'],
  timestamp: ['gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'not_null'],
};

export type AggregationFn = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p95';

export const AGGREGATIONS: readonly AggregationFn[] = [
  'count',
  'count_distinct',
  'sum',
  'avg',
  'min',
  'max',
  'p50',
  'p95',
];

/** Which field types each aggregation accepts. `count` also accepts no field. */
export const AGGREGATION_TYPES: Record<AggregationFn, readonly FieldType[]> = {
  count: ['string', 'number', 'boolean', 'timestamp', 'enum'],
  count_distinct: ['string', 'number', 'boolean', 'timestamp', 'enum'],
  sum: ['number'],
  avg: ['number'],
  min: ['number', 'timestamp'],
  max: ['number', 'timestamp'],
  p50: ['number'],
  p95: ['number'],
};

export function operatorsForField(ref: string): readonly OperatorId[] {
  const field = getField(ref);
  return field ? OPERATORS_BY_TYPE[field.type] : [];
}

/** Human hint for why a field/operator or field/aggregation pairing is rejected. */
export function compatibilityHint(ref: string, op: OperatorId | AggregationFn): string | null {
  const field = getField(ref);
  if (!field) return `Unknown field ${ref}.`;
  if ((AGGREGATIONS as readonly string[]).includes(op)) {
    const allowed = AGGREGATION_TYPES[op as AggregationFn];
    return allowed.includes(field.type)
      ? null
      : `${op} needs a ${allowed.join(' or ')} field; ${ref} is ${field.type}.`;
  }
  const operators = OPERATORS_BY_TYPE[field.type];
  return operators.includes(op as OperatorId)
    ? null
    : `${OPERATOR_LABELS[op as OperatorId] ?? op} is not available for ${field.type} fields (try ${operators
        .slice(0, 3)
        .map((candidate) => OPERATOR_LABELS[candidate])
        .join(', ')}).`;
}
