import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function callGet(id: string): Promise<Response> {
  const request = new NextRequest(`http://localhost/api/runs/${id}/clusters`);
  return GET(request, { params: Promise.resolve({ id }) });
}

describe('GET /api/runs/[id]/clusters', () => {
  const originalRunsApiUrl = process.env.RUNS_API_URL;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    delete process.env.RUNS_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (originalRunsApiUrl === undefined) delete process.env.RUNS_API_URL;
    else process.env.RUNS_API_URL = originalRunsApiUrl;
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  it('returns 404 for an unknown run', async () => {
    const response = await callGet('run-9999');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Run not found');
  });

  it('returns the W5-E09 envelope with the run cluster and drill-down members', async () => {
    const response = await callGet('run-1001');
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        runId: string;
        cluster: { count: number; members: { runId?: string }[] } | null;
        clusters: unknown[];
        rules: { rulesVersion: number; taxonomyVersion: number };
      };
      total: number;
    };

    // Envelope (W5-E09): { data, total }.
    expect(body.data.runId).toBe('run-1001');
    expect(Array.isArray(body.data.clusters)).toBe(true);
    expect(body.total).toBe(body.data.clusters.length);
    expect(body.data.rules.rulesVersion).toBeGreaterThan(0);
    expect(body.data.rules.taxonomyVersion).toBeGreaterThan(0);

    // The run is a failed run, so it belongs to a cluster.
    expect(body.data.cluster).not.toBeNull();
    expect(body.data.cluster!.count).toBeGreaterThan(0);
    expect(body.data.cluster!.members.some((m) => m.runId === 'run-1001')).toBe(true);
  });

  it('returns a null cluster for a run without crash details', async () => {
    const response = await callGet('run-1000');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { cluster: unknown | null } };
    expect(body.data.cluster).toBeNull();
  });
});
