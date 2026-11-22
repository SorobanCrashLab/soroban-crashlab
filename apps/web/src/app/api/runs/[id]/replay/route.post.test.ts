import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { buildMockRuns } from '../../../../mockRuns';
import { replayJobStore } from '@/lib/replay/job-store';
import { POST } from './route';

const crashed = buildMockRuns().find((run) => run.crashDetail !== null);

function post(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/runs/${crashed?.id}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/runs/[id]/replay (job flow)', () => {
  beforeEach(() => {
    replayJobStore.reset();
  });

  it('requires a crashed run to exist in the fixture set', () => {
    expect(crashed).toBeDefined();
  });

  it('runs the mock runner and returns the legacy fields plus a job id', async () => {
    if (!crashed) return;
    const response = await POST(post({ runner: 'mock', actor: 'dana' }), params(crashed.id));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        ok: boolean;
        jobId: string;
        newRunId: string;
        runId: string;
        bundleJson: string;
        command: string;
        result: { outcome: string; diagnostics: { exitCode: number } };
        events: Array<{ seq: number; percent: number }>;
      };
    };

    expect(body.data.ok).toBe(true);
    expect(body.data.runId).toBe(crashed.id);
    expect(body.data.jobId).toMatch(/^replay-job-/);
    expect(body.data.newRunId).toMatch(new RegExp(`^replay-${crashed.id}-`));
    expect(typeof body.data.bundleJson).toBe('string');
    expect(body.data.result.outcome).toBe('match');
    expect(body.data.events.at(-1)).toMatchObject({ percent: 100 });

    const job = replayJobStore.get(body.data.jobId);
    expect(job?.status).toBe('succeeded');
    expect(job?.requestedBy).toBe('dana');
  });

  it('defaults to the host runner when the body is empty', async () => {
    if (!crashed) return;
    const response = await POST(post({}), params(crashed.id));
    // On a machine without the Rust toolchain this is the documented
    // runner-unavailable path; with it, the replay succeeds. Both are valid,
    // and both must carry a job id.
    expect([200, 409, 502, 503]).toContain(response.status);

    const body = (await response.json()) as { data?: { jobId?: string } };
    expect(body.data?.jobId).toMatch(/^replay-job-/);
  });

  it('rejects an unknown runner with 400', async () => {
    if (!crashed) return;
    const response = await POST(post({ runner: 'docker' }), params(crashed.id));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/unsupported replay runner/i);
  });

  it('rejects malformed JSON with 400', async () => {
    if (!crashed) return;
    const response = await POST(post('{not json'), params(crashed.id));
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown run', async () => {
    const response = await POST(post({ runner: 'mock' }), params('run-does-not-exist'));
    expect(response.status).toBe(404);
  });

  it('does not create a job when the run cannot be replayed', async () => {
    const clean = buildMockRuns().find((run) => !run.crashDetail);
    expect(clean).toBeDefined();
    if (!clean) return;

    const response = await POST(post({ runner: 'mock' }), params(clean.id));
    expect(response.status).toBe(422);
    expect(replayJobStore.listBySource(clean.id)).toEqual([]);
  });

  it('explains the unavailable RPC simulator instead of running the host binary', async () => {
    if (!crashed) return;
    const response = await POST(post({ runner: 'rpc-sim' }), params(crashed.id));
    expect(response.status).toBe(503);

    const body = (await response.json()) as {
      data: { ok: boolean; jobId: string; failure: { reason: string; guidance: string }; status: string };
    };
    expect(body.data.ok).toBe(false);
    expect(body.data.status).toBe('failed');
    expect(body.data.failure.reason).toBe('runner-unavailable');
    expect(body.data.failure.guidance).toMatch(/host runner|mock runner/i);
  });
});
