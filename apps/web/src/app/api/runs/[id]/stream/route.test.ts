import { afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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

function request(path = '/api/runs/run-1/stream', headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

async function readEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const body = await response.text();
  return body
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('data: ')))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>);
}

function readIds(rawBody: string): string[] {
  return rawBody
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((line) => line.startsWith('id: ')))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.slice('id: '.length));
}

describe('GET /api/runs/[id]/stream', () => {
  beforeEach(() => {
    getRun.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a static snapshot and closes for a finished run', async () => {
    getRun.mockResolved(makeRun({ status: 'completed', seedCount: 7, duration: 42 }));

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
      .mockResolvedValue(makeRun({ status: 'completed', seedCount: 20, duration: 200 }));

    const response = await GET(request(), { params: Promise.resolve({ id: 'run-1' }) });
    const bodyPromise = readEvents(response);
    await vi.runAllTimersAsync();
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
    getRun.mockResolved(undefined);

    const response = await GET(request(), { params: Promise.resolve({ id: 'missing' }) });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Run not found');
  });

  it('sets an id on every event and increments sequentially', async () => {
    vi.useFakeTimers();
    getRun
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 1 }))
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 2 }))
      .mockResolvedValue(makeRun({ status: 'completed', seedCount: 3 }));

    const response = await GET(request(), { params: Promise.resolve({ id: 'run-1' }) });
    const bodyPromise = response.text();
    await vi.runAllTimersAsync();
    const rawBody = await bodyPromise;

    const ids = readIds(rawBody);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(ids.map((_, index) => String(index + 1)));
  });

  it('replays events after Last-Event-ID on reconnect', async () => {
    vi.useFakeTimers();
    getRun
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 1 }))
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 2 }))
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 3 }))
      .mockResolvedValue(makeRun({ status: 'completed', seedCount: 4 }));

    const first = await GET(request(), { params: Promise.resolve({ id: 'run-1' }) });
    const firstBody = first.text();
    await vi.runAllTimersAsync();
    const firstRaw = await firstBody;
    const firstIds = readIds(firstRaw);
    expect(firstIds.length).toBeGreaterThan(1);

    // Reset the mock so the resumed connection sees a consistent running
    // state and then completes.
    getRun.mockReset();
    getRun
      .mockResolvedValueOnce(makeRun({ status: 'running', seedCount: 4 }))
      .mockResolvedValue(makeRun({ status: 'completed', seedCount: 5 }));

    const resumeFrom = firstIds[0];
    const resumed = await GET(request('/api/runs/run-1/stream', { 'Last-Event-ID': resumeFrom }), {
      params: Promise.resolve({ id: 'run-1' }),
    });
    const resumeBody = resumed.text();
    await vi.runAllTimersAsync();
    const resumeRaw = await resumeBody;
    const resumeIds = readIds(resumeRaw);

    expect(resumeIds.length).toBeGreaterThan(0);
    expect(resumeIds[0]).toBe(String(Number(resumeFrom) + 1));
  });

  it('emits heartbeat comment frames while the run is running', async () => {
    vi.useFakeTimers();
    getRun.mockResolved(makeRun({ status: 'running' }));

    const controller = new AbortController();
    const requestWithSignal = new Request('http://localhost/api/runs/run-1/stream', {
      signal: controller.signal,
    });
    const response = await GET(requestWithSignal, { params: Promise.resolve({ id: 'run-1' }) });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';

    const pump = (async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value);
      }
    })();

    await vi.runAllTimersAsync();
    controller.abort();
    await pump.catch(() => undefined);

    expect(received).toContain(': ping');
  });

  it('cleans up timers and listeners on client disconnect', async () => {
    vi.useFakeTimers();
    getRun.mockResolved(makeRun({ status: 'running' }));

    const controller = new AbortController();
    const requestWithSignal = new Request('http://localhost/api/runs/run-1/stream', {
      signal: controller.signal,
    });
    const response = await GET(requestWithSignal, { params: Promise.resolve({ id: 'run-1' }) });
    const reader = response.body!.getReader();
    const pump = (async () => {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    })();

    await vi.runOnlyPendingTimersAsync();
    const pendingBefore = vi.getTimerCount();
    expect(pendingBefore).toBeGreaterThan(0);

    controller.abort();
    await pump.catch(() => undefined);
    await vi.runOnlyPendingTimersAsync();

    expect(vi.getTimerCount()).toBe(0);
  });
});
