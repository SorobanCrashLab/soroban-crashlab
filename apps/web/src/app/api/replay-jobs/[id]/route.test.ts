import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { replayJobStore } from '@/lib/replay/job-store';
import { GET } from './route';

function request(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/replay-jobs/${id}`);
}

describe('GET /api/replay-jobs/[id]', () => {
  beforeEach(() => {
    replayJobStore.reset();
  });

  it('returns a known job with its events', async () => {
    const job = replayJobStore.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
    replayJobStore.appendEvent(job.id, { phase: 'bundle', message: 'bundle', percent: 20 });

    const response = await GET(request(job.id), { params: Promise.resolve({ id: job.id }) });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: { job: { id: string; events: unknown[] } } };
    expect(body.data.job.id).toBe(job.id);
    expect(body.data.job.events).toHaveLength(2);
  });

  it('returns 404 for an unknown or expired job', async () => {
    const response = await GET(request('replay-job-missing'), {
      params: Promise.resolve({ id: 'replay-job-missing' }),
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });
});
