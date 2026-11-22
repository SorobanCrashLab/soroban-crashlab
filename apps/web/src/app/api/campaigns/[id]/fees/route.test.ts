import { afterEach, describe, expect, it } from 'vitest';
import type { FuzzingRun } from '@/app/types';
import { buildMockRuns } from '@/app/mockRuns';
import { InMemoryRunDriver } from '@/lib/storage/in-memory-run-driver';
import { resetRunStorageDriver, setRunStorageDriver } from '@/lib/storage';
import { GET } from './route';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    campaignId: 'campaign-a',
    status: 'completed',
    area: 'budget',
    severity: 'low',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 500_000,
    memoryBytes: 2_000_000,
    minResourceFee: 3_500,
    feeWarnThreshold: 2_500,
    resourceUsage: { cpuInstructions: 500_000, memoryBytes: 2_000_000, minBuiltinEntries: 2 },
    fee: { minResourceFee: 3_500, feeWarnThreshold: 2_500 },
    startedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://t${path}`, { headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => {
  resetRunStorageDriver();
  delete process.env.NEXT_PUBLIC_ENABLE_MOCK_DATA;
});

describe('GET /api/campaigns/[id]/fees', () => {
  it('aggregates a campaign server-side with bounded buckets and top-N', async () => {
    setRunStorageDriver(
      new InMemoryRunDriver([
        makeRun({ id: 'run-a', minResourceFee: 2_900 }),
        makeRun({ id: 'run-b', minResourceFee: 4_500 }),
        makeRun({ id: 'run-c', campaignId: 'campaign-b', minResourceFee: 9_000 }),
      ]),
    );

    const res = await GET(
      request('/api/campaigns/campaign-a/fees?top=2&buckets=4&trendPoints=10'),
      params('campaign-a'),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        campaignId: string;
        runCount: number;
        histograms: { fee: { buckets: unknown[] } };
        expensiveFixtures: unknown[];
        trend: unknown[];
      };
    };

    expect(body.data.campaignId).toBe('campaign-a');
    expect(body.data.runCount).toBe(2);
    expect(body.data.histograms.fee.buckets).toHaveLength(4);
    expect(body.data.expensiveFixtures.length).toBeLessThanOrEqual(2);
    expect(Array.isArray(body.data.trend)).toBe(true);
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate');
    expect(res.headers.get('ETag')).toBeTruthy();
  });

  it('serves the deterministic fixture campaign with known distributions', async () => {
    setRunStorageDriver(new InMemoryRunDriver(buildMockRuns()));

    const res = await GET(
      request('/api/campaigns/campaign-fixture/fees'),
      params('campaign-fixture'),
    );
    const body = (await res.json()) as {
      data: {
        runCount: number;
        coverage: { envelope: number };
        expensiveSuccessCount: number;
        expensiveFailureCount: number;
        histograms: { fee: { total: number; warningMarker: { inRange: boolean } } };
        expensiveFixtures: Array<{ href: string }>;
      };
    };

    expect(body.data.runCount).toBe(25);
    expect(body.data.coverage.envelope).toBe(25);
    expect(body.data.histograms.fee.total).toBe(25);
    expect(body.data.histograms.fee.warningMarker.inRange).toBe(true);
    expect(body.data.expensiveSuccessCount).toBeGreaterThan(0);
    expect(body.data.expensiveFailureCount).toBeGreaterThan(0);
    expect(body.data.expensiveFixtures[0].href).toMatch(/^\/runs\/run-/);
  });

  it('honours explicit threshold overrides', async () => {
    setRunStorageDriver(new InMemoryRunDriver([makeRun({ minResourceFee: 3_500 })]));

    const res = await GET(
      request('/api/campaigns/campaign-a/fees?feeWarn=1000&feeCritical=3000'),
      params('campaign-a'),
    );
    const body = (await res.json()) as {
      data: { thresholds: { feeWarning: number; feeCritical: number } };
    };

    expect(body.data.thresholds.feeWarning).toBe(1_000);
    expect(body.data.thresholds.feeCritical).toBe(3_000);
  });

  it('returns 304 for a matching ETag', async () => {
    setRunStorageDriver(new InMemoryRunDriver([makeRun()]));

    const first = await GET(request('/api/campaigns/campaign-a/fees'), params('campaign-a'));
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await GET(
      request('/api/campaigns/campaign-a/fees', { 'If-None-Match': etag! }),
      params('campaign-a'),
    );
    expect(second.status).toBe(304);
  });

  it('returns an empty aggregate for a campaign with no matching runs', async () => {
    setRunStorageDriver(new InMemoryRunDriver([makeRun({ campaignId: 'campaign-b' })]));

    const res = await GET(request('/api/campaigns/campaign-a/fees'), params('campaign-a'));
    const body = (await res.json()) as {
      data: { runCount: number; hasFeeData: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.data.runCount).toBe(0);
    expect(body.data.hasFeeData).toBe(false);
  });

  it('rejects an empty campaign id', async () => {
    const res = await GET(request('/api/campaigns//fees'), params(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Campaign id is required.' });
  });

  it('returns 503 when mock data is disabled and no backend exists', async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCK_DATA = 'false';
    const res = await GET(request('/api/campaigns/campaign-a/fees'), params('campaign-a'));
    expect(res.status).toBe(503);
  });
});
