import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuzzingRun } from '@/app/types';

const { getRun } = vi.hoisted(() => ({
  getRun: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  selectRunStorageDriver: () => ({ getRun }),
}));

import { GET } from './route';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    status: 'running',
    area: 'auth',
    severity: 'low',
    duration: 100,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    ...overrides,
  };
}

function request(path = '/api/runs/run-1/stream'): Request {
  return new Request(`http://localhost${path}`);
}

async function readEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const body = await response.text();
  return body
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>);
}

describe('GET /api/runs/[id]/stream', () => {
  beforeEach(() => {
    getRun.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a static snapshot and closes for a finished run', async () => {
    getRun.mockResolvedValue(makeRun({ status: 'completed', seedCount: 7, duration: 42 }));

    const response = await GET(request(), { params: Promise.resolve({ id: 'run-1' }) });
    const events = await readEvents(response);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      seq: 1,
      runId: 'run-1',
      event: {
        type: 'STATIC',
        status: 'completed',
        reason: 'terminal',
        metrics: { seedCount: 7, duration: 42 },
      },
    });
    expect(JSON.stringify(events)).not.toContain('Live campaign checkpoint received');
    expect(JSON.stringify(events)).not.toContain('+128');
  });

  it('emits only persisted state when a running run transitions to finished', async () => {
    vi.useFakeTimers();
    getRun
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 10, duration: 100 }))
      .mockResolvedValueOnce(makeRun({ status: 'completed', seedCount: 20, duration: 200 }));

    const response = await GET(request(), { params: Promise.resolve({ id: 'run-1' }) });
    const bodyPromise = readEvents(response);
    await vi.advanceTimersByTimeAsync(5_000);
    const events = await bodyPromise;

    expect(events.map((event) => event.event)).toEqual([
      {
        type: 'RUN_STATUS',
        status: 'running',
        metrics: { seedCount: 10, duration: 100 },
      },
      {
        type: 'RUN_STATUS',
        status: 'completed',
        metrics: { seedCount: 20, duration: 200 },
      },
      {
        type: 'STATIC',
        status: 'completed',
        reason: 'terminal',
        metrics: { seedCount: 20, duration: 200 },
      },
    ]);
  });

  it('returns 404 when the run is not present', async () => {
    getRun.mockResolvedValue(undefined);

    const response = await GET(request(), { params: Promise.resolve({ id: 'missing' }) });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Run not found');
  });
});
