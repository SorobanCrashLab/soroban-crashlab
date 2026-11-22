import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { replayJobStore } from '@/lib/replay/job-store';
import { GET } from './route';

function request(id: string, after?: number): NextRequest {
  const suffix = after === undefined ? '' : `?after=${after}`;
  return new NextRequest(`http://localhost/api/replay-jobs/${id}/stream${suffix}`);
}

async function finishedJob(): Promise<string> {
  const job = replayJobStore.create({ sourceRunId: 'run-1', runner: 'mock', requestedBy: 'dana' });
  replayJobStore.appendEvent(job.id, { phase: 'bundle', message: 'bundle resolved', percent: 20 });
  replayJobStore.transition(job.id, 'running');
  replayJobStore.appendEvent(job.id, { phase: 'done', message: 'Replay complete.', percent: 100 });
  replayJobStore.transition(job.id, 'succeeded');
  return job.id;
}

describe('GET /api/replay-jobs/[id]/stream', () => {
  beforeEach(() => {
    replayJobStore.reset();
  });

  it('emits every event and a terminal done frame', async () => {
    const id = await finishedJob();
    const response = await GET(request(id), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const text = await response.text();
    expect(text.startsWith(': connected')).toBe(true);
    expect(text).toContain('event: replay');
    expect(text).toContain('id: 1');
    expect(text).toContain('"message":"bundle resolved"');
    expect(text).toContain('event: done');
    expect(text).toContain('"status":"succeeded"');
  });

  it('replays only events after the requested sequence', async () => {
    const id = await finishedJob();
    const response = await GET(request(id, 2), { params: Promise.resolve({ id }) });
    const text = await response.text();

    expect(text).not.toContain('id: 1\n');
    expect(text).not.toContain('id: 2\n');
    expect(text).toContain('id: 3\n');
  });

  it('returns 404 for an unknown job', async () => {
    const response = await GET(request('missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
  });
});
