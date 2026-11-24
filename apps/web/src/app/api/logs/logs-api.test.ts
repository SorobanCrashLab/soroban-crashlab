import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as searchLogs } from './search/route';
import { GET as tailLogs } from './tail/route';
import { timestampForIndex } from '@/lib/logs/dataset';
import type { LogSearchResponse, LogTailResponse } from '@/lib/logs/types';

function request(url: string, role = 'viewer'): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    headers: { 'x-crashlab-role': role, 'x-crashlab-user': 'test' },
  });
}

describe('GET /api/logs/search', () => {
  it('returns facets, histogram and canonical query', async () => {
    const response = await searchLogs(request(
      `/api/logs/search?q=level%3Aerror&from=${timestampForIndex(20_000)}&to=${timestampForIndex(0)}&limit=5`,
    ));
    expect(response.status).toBe(200);
    const body = (await response.json()) as LogSearchResponse;
    expect(body.canonicalQuery).toBe('level:error');
    expect(body.events).toHaveLength(5);
    expect(body.facets.some((facet) => facet.field === 'level')).toBe(true);
    expect(body.histogram.length).toBeGreaterThan(0);
    expect(body.events.every((event) => event.level === 'error')).toBe(true);
  });

  it('rejects invalid DSL with diagnostics', async () => {
    const response = await searchLogs(request('/api/logs/search?q=level%3A'));
    expect(response.status).toBe(400);
  });

  it('masks sensitive fields for viewers but not maintainers', async () => {
    const url = `/api/logs/search?q=authorization%3A*&from=${timestampForIndex(9_999)}&to=${timestampForIndex(0)}&limit=20`;
    const viewer = (await (await searchLogs(request(url))).json()) as LogSearchResponse;
    const maintainer = (await (await searchLogs(request(url, 'maintainer'))).json()) as LogSearchResponse;
    expect(viewer.events.length + maintainer.events.length).toBeGreaterThan(0);
    expect(viewer.events.every((event) => !String(event.attributes.authorization ?? '').includes('Bearer'))).toBe(true);
    expect(maintainer.events.some((event) => String(event.attributes.authorization ?? '').includes('Bearer'))).toBe(true);
  });
});

describe('GET /api/logs/tail', () => {
  it('returns a cursor, rate and notices', async () => {
    const response = await tailLogs(request('/api/logs/tail?cursor=0&limit=5'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as LogTailResponse;
    expect(body.events.length).toBeLessThanOrEqual(5);
    expect(Number(body.cursor)).toBeGreaterThan(0);
    expect(Array.isArray(body.notices)).toBe(true);
  });

  it('rejects oversized batches', async () => {
    const response = await tailLogs(request('/api/logs/tail?limit=500'));
    expect(response.status).toBe(400);
  });
});
