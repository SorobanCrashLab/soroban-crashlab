import { describe, expect, it } from 'vitest';
import { buildMockRuns } from '@/app/mockRuns';
import { crashRows, metricRows, runToRow, traceRows } from '../adapters/runs';
import { ciRunToRow } from '../adapters/ci';
import { MOCK_CI_SNAPSHOT } from '@/features/ci/lib/mock-provider';
import { executeQuery, REDACTED, type Datasets } from './engine';
import { explainQuery } from './explain';
import {
  appendFilterNode,
  createQuery,
  defaultValueFor,
  moveItem,
  pruneEntity,
  removeFilterNode,
  type VisualQuery,
} from './model';
import { drillDownHref, pivotRows, safeCsvCell, timelineBuckets, toCsv } from './results';
import { pushHistory, upsertSavedQuery } from './saved';
import { joinableRelations, compatibilityHint } from './schema';
import {
  decodeShareToken,
  encodeShareToken,
  parseQueryJson,
  queryFingerprint,
  serializeQuery,
  toDsl,
} from './serialize';
import { QUERY_TEMPLATES, findTemplate } from './templates';
import { bindParams, validateQuery } from './validate';

function parse(json: unknown): VisualQuery {
  const parsed = parseQueryJson(json);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.query;
}

const runs = buildMockRuns();
const datasets: Datasets = {
  runs: runs.map(runToRow),
  crashes: crashRows(runs),
  traces: traceRows(runs),
  metrics: metricRows(runs),
  ci: MOCK_CI_SNAPSHOT.runs.map(ciRunToRow),
  logs: [
    { id: 'l1', timestamp: 1_000, level: 'error', source: 'rpc', message: 'token=sk_live_abcdef123456 leaked', run_id: 'run-1000', trace_id: 'trace-run-1000', campaign_id: null, error_code: 'RPC-TIMEOUT', contract: 'token' },
    { id: 'l2', timestamp: 5_000, level: 'info', source: 'rpc', message: 'ok', run_id: 'run-9999', trace_id: null, campaign_id: null, error_code: null, contract: 'token' },
    { id: 'l3', timestamp: 10_000, level: 'error', source: 'fuzz-worker', message: 'trap', run_id: null, trace_id: null, campaign_id: null, error_code: 'WASM-TRAP', contract: 'escrow' },
  ],
};

describe('schema', () => {
  it('orients relations from the entities already present', () => {
    const fromCrashes = joinableRelations(['crashes']);
    expect(fromCrashes).toEqual([
      expect.objectContaining({ id: 'runs-crashes', from: 'crashes', to: 'runs', reversed: true, cardinality: 'many-to-one' }),
    ]);
    const fromRuns = joinableRelations(['runs', 'crashes']).map((relation) => relation.to);
    expect(fromRuns).toEqual(['logs', 'traces', 'metrics']);
  });

  it('explains incompatible operator and aggregation pairings', () => {
    expect(compatibilityHint('runs.status', 'gt')).toMatch(/not available for enum/);
    expect(compatibilityHint('runs.status', 'avg')).toMatch(/needs a number field/);
    expect(compatibilityHint('runs.duration_ms', 'avg')).toBeNull();
  });
});

describe('serialization parity', () => {
  it('round-trips every template byte-for-byte', () => {
    for (const template of QUERY_TEMPLATES) {
      const text = serializeQuery(template.query);
      const reparsed = parse(JSON.parse(text));
      expect(serializeQuery(reparsed)).toBe(text);
      expect(queryFingerprint(reparsed)).toBe(queryFingerprint(template.query));
    }
  });

  it('ignores UI ids and set ordering but keeps range bounds ordered', () => {
    const base = findTemplate('failures-by-area')!.query;
    const a = appendFilterNode(base.filters, 'root', {
      id: 'x1', kind: 'condition', field: 'runs.severity', op: 'in', value: ['high', 'critical'],
    });
    const b = appendFilterNode(base.filters, 'root', {
      id: 'zz', kind: 'condition', field: 'runs.severity', op: 'in', value: ['critical', 'high', 'high'],
    });
    expect(serializeQuery({ ...base, filters: a })).toBe(serializeQuery({ ...base, filters: b }));
    const between = { ...base, filters: appendFilterNode(base.filters, 'root', {
      id: 'b', kind: 'condition', field: 'runs.duration_ms', op: 'between', value: [10, 2],
    }) };
    expect(serializeQuery(between)).toContain('[10,2]');
  });

  it('round-trips through share tokens and rejects junk', () => {
    const query = findTemplate('slow-spans-failed-runs')!.query;
    const decoded = decodeShareToken(encodeShareToken(query));
    expect(decoded.ok && serializeQuery(decoded.query)).toBe(serializeQuery(query));
    expect(decodeShareToken('%%%').ok).toBe(false);
    expect(parseQueryJson('{"version":2}').ok).toBe(false);
    expect(parseQueryJson('{bad').ok).toBe(false);
  });

  it('renders a readable DSL from the same model', () => {
    const dsl = toDsl(findTemplate('slow-spans-failed-runs')!.query);
    expect(dsl.split('\n')).toEqual([
      'SELECT traces.name, p95(traces.duration_ms) AS p95_ms, count(*) AS spans',
      'FROM runs',
      'JOIN traces VIA runs-traces',
      "WHERE runs.status = 'failed' AND runs.severity = :severity",
      'GROUP BY traces.name',
      'ORDER BY p95_ms DESC',
      'LIMIT 20',
      "-- params: :severity string = 'high'",
    ]);
  });
});

describe('validation', () => {
  it('blocks incompatible operators, unjoined fields and bad sorts', () => {
    const query = parse({
      version: 1,
      source: 'runs',
      filters: {
        kind: 'group',
        combinator: 'and',
        children: [
          { kind: 'condition', field: 'runs.status', op: 'gt', value: 'failed' },
          { kind: 'condition', field: 'traces.duration_ms', op: 'gt', value: 5 },
        ],
      },
      groupBy: ['runs.area'],
      aggregations: [{ fn: 'avg', field: 'runs.status', alias: 'bad' }],
      sort: [{ key: 'runs.severity', direction: 'asc' }],
      limit: 5000,
    });
    const messages = validateQuery(query).errors.map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/Operator gt is not valid for enum/);
    expect(messages).toMatch(/traces.duration_ms belongs to traces, which is not joined/);
    expect(messages).toMatch(/avg needs a number field/);
    expect(messages).toMatch(/sorted by a group-by field or an aggregation alias/);
    expect(messages).toMatch(/capped at 1000/);
  });

  it('only lets maintainers compute over restricted fields', () => {
    const query = parse({
      version: 1,
      source: 'crashes',
      filters: { kind: 'group', combinator: 'and', children: [{ kind: 'condition', field: 'crashes.payload', op: 'contains', value: 'G' }] },
    });
    expect(validateQuery(query, 'analyst').valid).toBe(false);
    expect(validateQuery(query, 'maintainer').valid).toBe(true);
    const projection = parse({ version: 1, source: 'crashes', select: ['crashes.payload'] });
    const result = validateQuery(projection, 'analyst');
    expect(result.valid).toBe(true);
    expect(result.warnings[0].message).toMatch(/redacted/);
  });

  it('rejects joins that do not follow a relation', () => {
    const query = parse({ version: 1, source: 'ci', joins: [{ relation: 'runs-crashes', entity: 'crashes', kind: 'inner' }] });
    expect(validateQuery(query).errors[0].message).toMatch(/does not connect crashes/);
  });

  it('binds parameters with defaults and type coercion', () => {
    const query = findTemplate('slow-spans-failed-runs')!.query;
    const withDefault = bindParams(query);
    expect(withDefault.ok && JSON.stringify(withDefault.query.filters)).toContain('"high"');
    const numeric = parse({
      version: 1,
      source: 'runs',
      filters: { kind: 'group', combinator: 'and', children: [{ kind: 'condition', field: 'runs.duration_ms', op: 'gt', value: { param: 'min' } }] },
      params: [{ name: 'min', type: 'number' }],
    });
    const bound = bindParams(numeric, { min: '1500' });
    expect(bound.ok && bound.query.filters.children[0]).toMatchObject({ value: 1500 });
    expect(bindParams(numeric, {}).ok).toBe(false);
  });
});

describe('engine', () => {
  it('aggregates failed runs by area deterministically', () => {
    const query = findTemplate('failures-by-area')!.query;
    const first = executeQuery(query, datasets);
    const second = executeQuery(query, datasets);
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.rows).toEqual(second.rows);
    const failed = runs.filter((run) => run.status === 'failed');
    const total = first.rows.reduce((sum, row) => sum + Number(row.failed_runs), 0);
    expect(total).toBe(failed.length);
    const counts = first.rows.map((row) => Number(row.failed_runs));
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('inner joins fan out and left joins keep unmatched rows', () => {
    const inner = executeQuery(parse({ version: 1, source: 'runs', joins: [{ relation: 'runs-traces', entity: 'traces', kind: 'inner' }], limit: 1000 }), datasets);
    expect(inner.ok && inner.stats.joinedRows).toBe(runs.length * 4);
    const left = executeQuery(
      parse({ version: 1, source: 'runs', joins: [{ relation: 'runs-crashes', entity: 'crashes', kind: 'left' }], select: ['runs.id', 'crashes.id'], limit: 1000 }),
      datasets,
    );
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(left.rows).toHaveLength(runs.length);
    expect(left.rows.filter((row) => row['crashes.id'] === null).length).toBe(runs.filter((run) => !run.crashDetail).length);
  });

  it('follows reversed relations (crash → run)', () => {
    const result = executeQuery(
      parse({ version: 1, source: 'crashes', joins: [{ relation: 'runs-crashes', entity: 'runs', kind: 'inner' }], select: ['crashes.id', 'runs.status'], limit: 1000 }),
      datasets,
    );
    expect(result.ok && result.rows.every((row) => row['runs.status'] === 'failed')).toBe(true);
  });

  it('anchors relative windows to the newest value', () => {
    const query = parse({ version: 1, source: 'logs', timeWindow: { field: 'logs.timestamp', preset: 'last_1h' }, select: ['logs.id'] });
    const result = executeQuery(query, datasets);
    expect(result.ok && result.stats.window).toEqual({ from: 10_000 - 3_600_000, to: 10_000 });
    const custom = executeQuery(
      parse({ version: 1, source: 'logs', timeWindow: { field: 'logs.timestamp', preset: 'custom', from: 4_000, to: 6_000 }, select: ['logs.id'] }),
      datasets,
    );
    expect(custom.ok && custom.rows.map((row) => row['logs.id'])).toEqual(['l2']);
  });

  it('redacts restricted columns and inline secrets', () => {
    const query = parse({ version: 1, source: 'crashes', select: ['crashes.id', 'crashes.payload'], limit: 3 });
    const analyst = executeQuery(query, datasets, { role: 'analyst' });
    const maintainer = executeQuery(query, datasets, { role: 'maintainer' });
    expect(analyst.ok && analyst.rows.every((row) => row['crashes.payload'] === REDACTED)).toBe(true);
    expect(maintainer.ok && maintainer.rows.every((row) => row['crashes.payload'] !== REDACTED)).toBe(true);
    const logs = executeQuery(parse({ version: 1, source: 'logs', select: ['logs.message'] }), datasets, { role: 'maintainer' });
    expect(logs.ok && String(logs.rows[0]['logs.message'])).toContain('[REDACTED]');
  });

  it('enforces scan, fan-out and time guardrails with partial results', () => {
    const query = parse({ version: 1, source: 'runs', joins: [{ relation: 'runs-traces', entity: 'traces', kind: 'inner' }], limit: 1000 });
    const scan = executeQuery(query, datasets, { limits: { maxScanRows: 10 } });
    expect(scan.ok && scan.stats.truncated).toBe(true);
    const fanout = executeQuery(query, datasets, { limits: { maxIntermediateRows: 7 } });
    expect(fanout.ok && fanout.stats.joinedRows).toBe(7);
    let now = 0;
    const slow = executeQuery(query, datasets, { limits: { timeoutMs: 5 }, clock: () => (now += 10) });
    expect(slow.ok && slow.stats.timedOut).toBe(true);
  });

  it('sorts with nulls last in both directions and applies the limit', () => {
    const query = parse({ version: 1, source: 'runs', select: ['runs.id', 'runs.finished_at'], sort: [{ key: 'runs.finished_at', direction: 'desc' }], limit: 30 });
    const result = executeQuery(query, datasets);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const values = result.rows.map((row) => row['runs.finished_at']);
    const firstNull = values.indexOf(null);
    expect(firstNull === -1 || values.slice(firstNull).every((value) => value === null)).toBe(true);
    const limited = executeQuery({ ...query, limit: 3 }, datasets);
    expect(limited.ok && limited.rows.length).toBe(3);
    expect(limited.ok && limited.stats.truncated).toBe(true);
  });

  it('refuses to execute unbound parameters or invalid queries', () => {
    expect(executeQuery(findTemplate('slow-spans-failed-runs')!.query, datasets).ok).toBe(false);
    expect(executeQuery({ ...createQuery('runs'), limit: 0 }, datasets).ok).toBe(false);
  });
});

describe('explain', () => {
  it('estimates cost and suggests a window for large corpora', () => {
    const explain = explainQuery(parse({ version: 1, source: 'logs' }), { logs: { rows: 5_000 } });
    expect(explain.steps[0]).toMatchObject({ op: 'scan', estimatedRows: 5_000 });
    expect(explain.hints.join(' ')).toMatch(/Add a time window/);
    const joined = explainQuery(findTemplate('crash-signatures')!.query, { runs: { rows: 25 }, crashes: { rows: 10 } });
    expect(joined.steps.map((step) => step.op)).toEqual(['scan', 'join', 'aggregate', 'sort', 'limit']);
    expect(joined.costClass).toBe('low');
    expect(explainQuery(parse({ version: 1, source: 'logs' }), { logs: { rows: 200_000 } }).exceedsGuardrail).toBe(true);
  });
});

describe('result transforms', () => {
  const rows = [
    { area: 'auth', severity: 'high', n: 2, at: 0 },
    { area: 'auth', severity: 'low', n: 1, at: 50 },
    { area: 'xdr', severity: 'high', n: 4, at: 100 },
  ];

  it('pivots with sorted axes and row totals', () => {
    const pivot = pivotRows(rows, 'area', 'severity', 'n');
    expect(pivot.rowValues).toEqual(['auth', 'xdr']);
    expect(pivot.columnValues).toEqual(['high', 'low']);
    expect(pivot.cells).toEqual([[2, 1], [4, null]]);
    expect(pivot.rowTotals).toEqual([3, 4]);
  });

  it('buckets timelines and guards CSV formulas', () => {
    const buckets = timelineBuckets(rows, 'at', 2);
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 2]);
    expect(safeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(safeCsvCell(-5)).toBe('-5');
    expect(toCsv([{ key: 'area', label: 'area', type: 'string' }], rows).split('\n')).toEqual(['area', 'auth', 'auth', 'xdr']);
  });

  it('links drill-downs to entity pages but not redacted cells', () => {
    expect(drillDownHref({ key: 'runs.id', label: 'runs.id', type: 'string', entity: 'runs', field: 'id' }, 'run-1')).toBe('/runs/run-1');
    expect(drillDownHref({ key: 'logs.trace_id', label: '', type: 'string', entity: 'logs', field: 'trace_id' }, 't 1')).toBe(
      '/logs?q=trace_id%3At%201',
    );
    expect(drillDownHref({ key: 'x', label: '', type: 'string', entity: 'crashes', field: 'payload' }, REDACTED)).toBeNull();
  });
});

describe('composer helpers and persistence', () => {
  it('edits the filter tree immutably', () => {
    const query = createQuery('runs');
    const withGroup = appendFilterNode(query.filters, 'root', { id: 'g1', kind: 'group', combinator: 'or', negate: false, children: [] });
    const withCondition = appendFilterNode(withGroup, 'g1', { id: 'c1', kind: 'condition', field: 'runs.area', op: 'eq', value: 'auth' });
    expect(query.filters.children).toHaveLength(0);
    expect(JSON.stringify(withCondition)).toContain('"c1"');
    expect(JSON.stringify(removeFilterNode(withCondition, 'c1'))).not.toContain('"c1"');
    expect(moveItem([{ id: 'a' }, { id: 'b' }], 'b', -1).map((item) => item.id)).toEqual(['b', 'a']);
    expect(defaultValueFor('enum', 'in', ['x'])).toEqual(['x']);
  });

  it('prunes blocks that reference a removed join', () => {
    const query = findTemplate('crash-signatures')!.query;
    const pruned = pruneEntity(query, 'crashes');
    expect(pruned.joins).toHaveLength(0);
    expect(pruned.groupBy).toEqual([]);
  });

  it('upserts saved queries by name and dedupes history', () => {
    const query = findTemplate('failures-by-area')!.query;
    const once = upsertSavedQuery([], { name: 'Weekly', description: '', visibility: 'private', query, paramValues: {} }, new Date(1));
    const twice = upsertSavedQuery(once, { name: 'weekly', description: 'x', visibility: 'team', query, paramValues: {} }, new Date(2));
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ id: once[0].id, visibility: 'team' });
    const entry = { fingerprint: 'f', query, ranAt: '', tookMs: 1, rows: 1, truncated: false };
    expect(pushHistory(pushHistory([], entry), { ...entry, tookMs: 2 })).toHaveLength(1);
  });
});
