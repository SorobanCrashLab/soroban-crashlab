import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { PUT, DELETE } from './[id]/route';
import { POST as TICK } from './tick/route';
import { resetSchedulerState } from './_store';

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readData<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { data: T };
  return body.data;
}

beforeEach(() => resetSchedulerState());
afterEach(() => resetSchedulerState());

describe('GET /api/schedules', () => {
  it('returns the seeded schedules and an empty history', async () => {
    const data = await readData<{ schedules: unknown[]; history: unknown[] }>(await GET());
    expect(data.schedules.length).toBeGreaterThan(0);
    expect(data.history).toEqual([]);
  });
});

describe('POST /api/schedules', () => {
  it('creates a schedule', async () => {
    const res = await POST(
      jsonRequest('http://t/api/schedules', 'POST', { name: 'Q sweep', cron: '*/15 * * * *' }) as never,
    );
    expect(res.status).toBe(201);
    const data = await readData<{ schedule: { id: string; name: string; enabled: boolean } }>(res);
    expect(data.schedule.name).toBe('Q sweep');
    expect(data.schedule.enabled).toBe(true);
  });

  it('rejects an invalid cron expression with a precise message', async () => {
    const res = await POST(
      jsonRequest('http://t/api/schedules', 'POST', { name: 'Bad', cron: '99 * * * *' }) as never,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/out of range/);
  });

  it('rejects a duplicate name', async () => {
    const res = await POST(
      jsonRequest('http://t/api/schedules', 'POST', {
        name: 'Hourly smoke campaign',
        cron: '0 * * * *',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/already exists/);
  });
});

describe('PUT /api/schedules/[id]', () => {
  it('pauses a schedule', async () => {
    const res = await PUT(
      jsonRequest('http://t/api/schedules/sched-hourly-smoke', 'PUT', { enabled: false }) as never,
      { params: Promise.resolve({ id: 'sched-hourly-smoke' }) },
    );
    expect(res.status).toBe(200);
    const data = await readData<{ schedule: { enabled: boolean } }>(res);
    expect(data.schedule.enabled).toBe(false);
  });

  it('404s for an unknown id', async () => {
    const res = await PUT(jsonRequest('http://t/api/schedules/nope', 'PUT', { enabled: false }) as never, {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid patched expression', async () => {
    const res = await PUT(
      jsonRequest('http://t/api/schedules/sched-hourly-smoke', 'PUT', { cron: 'not-cron' }) as never,
      { params: Promise.resolve({ id: 'sched-hourly-smoke' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/schedules/[id]', () => {
  it('removes a schedule', async () => {
    const res = await DELETE(new Request('http://t/api/schedules/sched-weekly-deep', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'sched-weekly-deep' }),
    });
    expect(res.status).toBe(200);
    const data = await readData<{ schedules: { id: string }[] }>(await GET());
    expect(data.schedules.some((s) => s.id === 'sched-weekly-deep')).toBe(false);
  });
});

describe('POST /api/schedules/tick', () => {
  it('records one scheduled run per due schedule, tagged "scheduled", and is idempotent', async () => {
    // Seeded schedules were created 2026-03-01T00:00Z. Evaluate at 05:30Z:
    // nightly (03:00) fires once; hourly (01:00–05:00) collapses to one
    // catch-up run; the weekly schedule is paused.
    const body = { now: '2026-03-01T05:30:00.000Z' };

    const first = await TICK(jsonRequest('http://t/api/schedules/tick', 'POST', body) as never);
    const firstData = await readData<{
      created: { tags: string[]; scheduleName: string; caughtUp: boolean; tickCount: number }[];
      history: unknown[];
    }>(first);
    expect(firstData.created.length).toBe(2);
    firstData.created.forEach((run) => expect(run.tags).toContain('scheduled'));

    const hourly = firstData.created.find((r) => r.scheduleName === 'Hourly smoke campaign');
    expect(hourly?.caughtUp).toBe(true);
    expect(hourly?.tickCount).toBe(5);

    const second = await TICK(jsonRequest('http://t/api/schedules/tick', 'POST', body) as never);
    const secondData = await readData<{ created: unknown[]; history: unknown[] }>(second);
    expect(secondData.created).toEqual([]);
    expect(secondData.history.length).toBe(firstData.history.length);
  });
});
