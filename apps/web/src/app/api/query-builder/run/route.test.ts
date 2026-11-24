import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRbacPermission, describePrincipal } from '@/lib/rbac';
import { matchRouteCatalogEntry } from '@/lib/route-catalog';
import { canonicalQuery } from '@/features/query-builder/lib/serialize';
import { findTemplate } from '@/features/query-builder/lib/templates';
import { POST } from './route';

vi.mock('@/lib/rbac', () => ({
  checkRbacPermission: vi.fn(async () => null),
  describePrincipal: vi.fn(),
}));

const principal = (role: 'analyst' | 'maintainer', authenticated = true) => ({
  principal: { identityType: 'github' as const, identityValue: 'tester', subject: 'github:tester', authenticated },
  role,
  satisfies: () => true,
});

function post(body: unknown) {
  return new NextRequest('http://localhost/api/query-builder/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/query-builder/run', () => {
  beforeEach(() => {
    vi.mocked(checkRbacPermission).mockResolvedValue(null);
    vi.mocked(describePrincipal).mockResolvedValue(principal('analyst'));
  });

  it('is registered in the route catalog', () => {
    expect(matchRouteCatalogEntry('POST', '/api/query-builder/run')).toMatchObject({ authClass: 'session' });
  });

  it('runs a template against the run adapters', async () => {
    const response = await POST(post({ query: canonicalQuery(findTemplate('failures-by-area')!.query) }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      data: { viewer: { role: string }; result: { columns: Array<{ key: string }>; rows: unknown[] }; explain: { steps: unknown[] } };
    };
    expect(body.data.viewer.role).toBe('analyst');
    expect(body.data.result.columns.map((column) => column.key)).toEqual(['runs.area', 'failed_runs', 'avg_duration_ms']);
    expect(body.data.result.rows.length).toBeGreaterThan(0);
    expect(body.data.explain.steps.length).toBeGreaterThan(0);
  });

  it('binds parameters and reports missing ones', async () => {
    const query = canonicalQuery(findTemplate('slow-spans-failed-runs')!.query);
    const ok = await POST(post({ query, params: { severity: 'critical' } }));
    expect(ok.status).toBe(200);
    const bad = await POST(post({ query: { ...query, params: [{ name: 'severity', type: 'string' }] } }));
    expect(bad.status).toBe(422);
  });

  it('returns an explain plan without executing', async () => {
    const response = await POST(post({ query: canonicalQuery(findTemplate('crash-signatures')!.query), mode: 'explain' }));
    const body = (await response.json()) as { data: { dsl: string; result?: unknown; stats: Record<string, { rows: number }> } };
    expect(body.data.dsl).toContain('JOIN crashes VIA runs-crashes');
    expect(body.data.result).toBeUndefined();
    expect(body.data.stats.runs.rows).toBeGreaterThan(0);
  });

  it('rejects restricted-field filters for analysts but not maintainers', async () => {
    const query = {
      version: 1,
      source: 'crashes',
      filters: { kind: 'group', combinator: 'and', children: [{ kind: 'condition', field: 'crashes.payload', op: 'contains', value: 'G' }] },
    };
    expect((await POST(post({ query }))).status).toBe(422);
    vi.mocked(describePrincipal).mockResolvedValue(principal('maintainer'));
    expect((await POST(post({ query }))).status).toBe(200);
  });

  it('redacts restricted columns for unauthenticated callers', async () => {
    vi.mocked(describePrincipal).mockResolvedValue(principal('analyst', false));
    const response = await POST(post({ query: { version: 1, source: 'crashes', select: ['crashes.id', 'crashes.payload'] } }));
    const body = (await response.json()) as { data: { viewer: { role: string }; result: { rows: Array<Record<string, unknown>> } } };
    expect(body.data.viewer.role).toBe('anonymous');
    expect(body.data.result.rows.every((row) => row['crashes.payload'] === '[REDACTED]')).toBe(true);
  });

  it('rejects malformed bodies and unknown fields', async () => {
    expect((await POST(post({ query: { version: 1, source: 'nope' } }))).status).toBe(422);
    expect((await POST(post({ nope: true }))).status).toBe(400);
    const notJson = new NextRequest('http://localhost/api/query-builder/run', { method: 'POST', body: '{' });
    expect((await POST(notJson)).status).toBe(400);
  });

  it('surfaces RBAC denials unchanged', async () => {
    vi.mocked(checkRbacPermission).mockResolvedValue(new Response(null, { status: 403 }) as never);
    expect((await POST(post({ query: {} }))).status).toBe(403);
  });
});
