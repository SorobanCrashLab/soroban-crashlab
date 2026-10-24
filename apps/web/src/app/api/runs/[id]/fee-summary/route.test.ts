import { afterEach, describe, expect, it } from 'vitest';
import type { FuzzingRun } from '@/app/types';
import { InMemoryRunDriver } from '@/lib/storage/in-memory-run-driver';
import { resetRunStorageDriver, setRunStorageDriver } from '@/lib/storage';
import { GET } from './route';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    campaignId: 'campaign-fixture',
    status: 'failed',
    area: 'budget',
    severity: 'high',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 6_000_000,
    memoryBytes: 12_000_000,
    minResourceFee: 6_000,
    feeWarnThreshold: 2_500,
    resourceUsage: { cpuInstructions: 6_000_000, memoryBytes: 12_000_000 },
    fee: { minResourceFee: 6_000, feeWarnThreshold: 2_500, expensiveFailure: true },
    startedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://t/api/runs/run-1/fee-summary', { headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => resetRunStorageDriver());

describe('GET /api/runs/[id]/fee-summary', () => {
  it('returns the per-run summary with levels and flags', async () => {
    setRunStorageDriver(new InMemoryRunDriver([makeRun()]));

    const res = await GET(request(), params('run-1'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        runId: string;
        source: string;
        hasFeeData: boolean;
        expensiveFailure: boolean;
        levels: { overall: string };
      };
    };

    expect(body.data.runId).toBe('run-1');
    expect(body.data.source).toBe('envelope');
    expect(body.data.hasFeeData).toBe(true);
    expect(body.data.expensiveFailure).toBe(true);
    expect(body.data.levels.overall).toBe('critical');
  });

  it('returns 404 for a missing run', async () => {
    setRunStorageDriver(new InMemoryRunDriver([]));
    const res = await GET(request(), params('missing'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  it('reports fee-data-absent for pre-W5-A12 rows without metrics', async () => {
    const absent = {
      ...makeRun({ id: 'old-run' }),
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
      feeWarnThreshold: undefined,
      resourceUsage: undefined,
      fee: undefined,
    } as unknown as FuzzingRun;
    setRunStorageDriver(new InMemoryRunDriver([absent]));

    const res = await GET(request(), params('old-run'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { source: 'absent', hasFeeData: false },
    });
  });

  it('returns 304 for a matching ETag', async () => {
    setRunStorageDriver(new InMemoryRunDriver([makeRun()]));
    const first = await GET(request(), params('run-1'));
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await GET(request({ 'If-None-Match': etag! }), params('run-1'));
    expect(second.status).toBe(304);
  });
});
