import { describe, expect, it } from 'vitest';
import { parseQuery, tokenizeQuery } from './parser';
import { matchesQuery } from './evaluate';
import { getCompletions } from './autocomplete';
import {
  canonicalStateJson,
  decodeQueryState,
  encodeQueryState,
  normalizeQuery,
  serializeNode,
} from './serializer';
import { eventAt, indexForTimestamp, timestampForIndex } from '@/lib/logs/dataset';
import { canViewSensitiveLogs, redactLogEvent } from '@/lib/logs/redaction';
import { buildCorrelationLinks } from '@/lib/logs/correlation';
import { serializeLogExport } from '@/lib/logs/client';
import type { LogEvent, QueryState } from '@/lib/logs/types';

const event: LogEvent = {
  id: 'evt-1',
  timestamp: Date.parse('2026-01-15T10:00:00Z'),
  level: 'error',
  source: 'fuzz-worker',
  message: 'INV-001 token=sk-live-abcdefghijklmnopqrstuvwxyz',
  contract: 'token',
  run_id: 'run-1042',
  campaign_id: 'camp-auth-2026',
  trace_id: 'tr-1042',
  error_code: 'INV-001',
  attributes: { latency_ms: 900, authorization: 'Bearer secret-value' },
  redacted: [],
};

const state: QueryState = {
  query: 'level:error',
  from: 1_000,
  to: 2_000,
  facets: { run_id: ['run-1042'], level: ['error'] },
  sort: 'desc',
  mode: 'historical',
  histogramRange: null,
};

describe('DSL parser', () => {
  it('tokenizes every character of a query', () => {
    const source = 'level:error AND source:fuzz-*';
    const tokens = tokenizeQuery(source);
    expect(tokens.map((token) => token.value).join('')).toBe(source);
    expect(tokens.some((token) => token.kind === 'keyword' && token.value === 'AND')).toBe(true);
  });

  it('parses field, boolean and negated terms', () => {
    const parsed = parseQuery('level:error AND NOT source:rpc');
    expect(parsed.valid).toBe(true);
    expect(matchesQuery(event, parsed.ast)).toBe(true);
    expect(matchesQuery({ ...event, source: 'rpc' }, parsed.ast)).toBe(false);
  });

  it('supports ranges, wildcards and comparisons', () => {
    expect(matchesQuery(event, parseQuery('source:fuzz-*').ast)).toBe(true);
    expect(matchesQuery(event, parseQuery('latency_ms:>=800').ast)).toBe(true);
    expect(matchesQuery(event, parseQuery('latency_ms:<800').ast)).toBe(false);
    const range = parseQuery('timestamp:[2026-01-15T09:00:00Z TO 2026-01-15T11:00:00Z]');
    expect(range.valid).toBe(true);
    expect(matchesQuery(event, range.ast)).toBe(true);
  });

  it('reports invalid queries without throwing', () => {
    const parsed = parseQuery('level: AND (source:rpc');
    expect(parsed.valid).toBe(false);
    expect(parsed.diagnostics.some((item) => item.severity === 'error')).toBe(true);
  });

  it('supports implicit AND and free text', () => {
    const parsed = parseQuery('level:error "INV-001"');
    expect(parsed.valid).toBe(true);
    expect(matchesQuery(event, parsed.ast)).toBe(true);
  });
});

describe('canonical serialization and URL state', () => {
  it('serializes equivalent queries identically', () => {
    const first = normalizeQuery('level:error AND source:fuzz-worker');
    const second = normalizeQuery('source:fuzz-worker AND level:error');
    expect(first.query).toBe(second.query);
    expect(serializeNode(parseQuery('level:error').ast)).toBe('level:error');
  });

  it('round-trips the full workbench state', () => {
    const token = encodeQueryState(state);
    expect(token.startsWith('lq1.')).toBe(true);
    expect(decodeQueryState(token)).toEqual(state);
    expect(decodeQueryState('not-a-token')).toBeNull();
  });

  it('orders facets deterministically', () => {
    const reordered: QueryState = { ...state, facets: { level: ['error'], run_id: ['run-1042'] } };
    expect(canonicalStateJson(reordered)).toBe(canonicalStateJson(state));
  });
});

describe('autocomplete', () => {
  it('suggests fields for a bare prefix', () => {
    const result = getCompletions({ source: 'lev', cursor: 3 });
    expect(result.items.map((item) => item.label)).toContain('level');
  });

  it('suggests facet values after a field operator', () => {
    const result = getCompletions({
      source: 'level:',
      cursor: 6,
      facets: [{ field: 'level', values: [{ value: 'error', count: 3 }] }],
    });
    expect(result.items.map((item) => item.label)).toContain('error');
  });
});

describe('redaction and permissions', () => {
  it('masks sensitive fields for viewers', () => {
    const safe = redactLogEvent(event, { role: 'viewer' });
    expect(safe.attributes.authorization).toBe('[REDACTED]');
    expect(safe.message).not.toContain('sk-live');
    expect(safe.redacted).toContain('attributes.authorization');
    expect(safe.redacted).toContain('message');
  });

  it('leaves values intact for maintainers', () => {
    expect(canViewSensitiveLogs({ role: 'maintainer' })).toBe(true);
    const raw = redactLogEvent(event, { role: 'maintainer' });
    expect(raw.attributes.authorization).toBe('Bearer secret-value');
    expect(raw.redacted).toEqual([]);
  });
});

describe('correlation and export', () => {
  it('builds run, trace and state links', () => {
    const links = buildCorrelationLinks(event);
    expect(links.find((link) => link.kind === 'run')?.href).toBe('/runs/run-1042');
    expect(links.find((link) => link.kind === 'trace')?.href).toContain('traceId=tr-1042');
    expect(links.find((link) => link.kind === 'state')?.href).toBe('/runs/run-1042/state');
  });

  it('exports JSON, NDJSON and CSV with metadata', () => {
    expect(serializeLogExport([event], 'json', state)).toContain('"metadata"');
    expect(serializeLogExport([event], 'ndjson', state).split('\n')).toHaveLength(2);
    const csv = serializeLogExport([event], 'csv', state);
    expect(csv.split('\n')[0]).toContain('trace_id');
    expect(csv).toContain('INV-001');
  });
});

describe('deterministic dataset', () => {
  it('maps indices to timestamps and back', () => {
    for (const index of [0, 9, 10, 500, 50_000]) {
      expect(indexForTimestamp(timestampForIndex(index))).toBe(index);
    }
    expect(eventAt(10).id).toBe('log-10');
  });
});
