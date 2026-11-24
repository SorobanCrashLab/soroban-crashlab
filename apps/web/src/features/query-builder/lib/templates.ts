/**
 * Starter templates for the analytics explorer (#2339). Written in the
 * canonical JSON form so they exercise the same parser as shared links.
 */

import type { VisualQuery } from './model';
import { parseQueryJson } from './serialize';

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  query: VisualQuery;
}

const RAW_TEMPLATES: Array<{ id: string; name: string; description: string; json: unknown }> = [
  {
    id: 'failures-by-area',
    name: 'Failures by area',
    description: 'Failed runs per area with average duration — the regression starting point.',
    json: {
      version: 1,
      source: 'runs',
      filters: { kind: 'group', combinator: 'and', children: [{ kind: 'condition', field: 'runs.status', op: 'eq', value: 'failed' }] },
      groupBy: ['runs.area'],
      aggregations: [
        { fn: 'count', field: null, alias: 'failed_runs' },
        { fn: 'avg', field: 'runs.duration_ms', alias: 'avg_duration_ms' },
      ],
      sort: [{ key: 'failed_runs', direction: 'desc' }],
      limit: 50,
    },
  },
  {
    id: 'crash-signatures',
    name: 'Crash signatures by severity',
    description: 'Runs joined to their crashes, counted per signature and severity.',
    json: {
      version: 1,
      source: 'runs',
      joins: [{ relation: 'runs-crashes', entity: 'crashes', kind: 'inner' }],
      groupBy: ['crashes.signature', 'crashes.severity'],
      aggregations: [{ fn: 'count_distinct', field: 'runs.id', alias: 'runs' }],
      sort: [{ key: 'runs', direction: 'desc' }],
      limit: 100,
    },
  },
  {
    id: 'slow-spans-failed-runs',
    name: 'Slow spans in failed runs',
    description: 'p95 span duration per operation for failed runs, parameterized by severity.',
    json: {
      version: 1,
      source: 'runs',
      joins: [{ relation: 'runs-traces', entity: 'traces', kind: 'inner' }],
      filters: {
        kind: 'group',
        combinator: 'and',
        children: [
          { kind: 'condition', field: 'runs.status', op: 'eq', value: 'failed' },
          { kind: 'condition', field: 'runs.severity', op: 'eq', value: { param: 'severity' } },
        ],
      },
      groupBy: ['traces.name'],
      aggregations: [
        { fn: 'p95', field: 'traces.duration_ms', alias: 'p95_ms' },
        { fn: 'count', field: null, alias: 'spans' },
      ],
      sort: [{ key: 'p95_ms', direction: 'desc' }],
      limit: 20,
      params: [{ name: 'severity', type: 'string', defaultValue: 'high', description: 'Run severity to inspect.' }],
    },
  },
  {
    id: 'error-logs-by-source',
    name: 'Error logs by source (24h)',
    description: 'Error-level log volume per source over the last day of the log window.',
    json: {
      version: 1,
      source: 'logs',
      filters: { kind: 'group', combinator: 'and', children: [{ kind: 'condition', field: 'logs.level', op: 'eq', value: 'error' }] },
      timeWindow: { field: 'logs.timestamp', preset: 'last_24h' },
      groupBy: ['logs.source'],
      aggregations: [{ fn: 'count', field: null, alias: 'errors' }],
      sort: [{ key: 'errors', direction: 'desc' }],
      limit: 25,
    },
  },
  {
    id: 'ci-failures-by-workflow',
    name: 'CI failures by workflow',
    description: 'Failing CI conclusions per workflow and branch.',
    json: {
      version: 1,
      source: 'ci',
      filters: {
        kind: 'group',
        combinator: 'and',
        children: [{ kind: 'condition', field: 'ci.conclusion', op: 'in', value: ['failure', 'timed_out'] }],
      },
      groupBy: ['ci.workflow', 'ci.branch'],
      aggregations: [
        { fn: 'count', field: null, alias: 'failures' },
        { fn: 'avg', field: 'ci.duration_ms', alias: 'avg_duration_ms' },
      ],
      sort: [{ key: 'failures', direction: 'desc' }],
      limit: 50,
    },
  },
  {
    id: 'coverage-by-run',
    name: 'Peak coverage per run',
    description: 'Maximum coverage and execution rate per run from metric samples.',
    json: {
      version: 1,
      source: 'metrics',
      filters: {
        kind: 'group',
        combinator: 'and',
        children: [{ kind: 'condition', field: 'metrics.metric', op: 'eq', value: 'coverage_pct' }],
      },
      groupBy: ['metrics.run_id'],
      aggregations: [{ fn: 'max', field: 'metrics.value', alias: 'peak_coverage_pct' }],
      sort: [{ key: 'peak_coverage_pct', direction: 'desc' }],
      limit: 25,
    },
  },
];

export const QUERY_TEMPLATES: readonly QueryTemplate[] = RAW_TEMPLATES.map((raw) => {
  const parsed = parseQueryJson(raw.json);
  if (!parsed.ok) throw new Error(`Template ${raw.id} is invalid: ${parsed.errors.join('; ')}`);
  return { id: raw.id, name: raw.name, description: raw.description, query: parsed.query };
});

export function findTemplate(id: string): QueryTemplate | null {
  return QUERY_TEMPLATES.find((template) => template.id === id) ?? null;
}
