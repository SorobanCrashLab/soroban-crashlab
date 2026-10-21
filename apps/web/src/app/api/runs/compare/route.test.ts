import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { buildMockRuns } from '../../../mockRuns';
import { GET } from './route';

const runs = buildMockRuns();
const crashed = runs.filter((run) => run.crashDetail !== null);

function pick(index: number) {
  const run = crashed[index];
  if (!run) throw new Error('fixture runs must include at least two crashed runs');
  return run;
}

const baseRun = pick(0);
const candidateRun = pick(1);

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/runs/compare?${query}`);
}

interface CompareBody {
  data: {
    base: { runId: string; signatureCount: number; metrics: { seeds: number } };
    candidate: { runId: string; signatureCount: number; metrics: { seeds: number } };
    filters: { failureClass?: string; contract?: string };
    delta: {
      added: unknown[];
      removed: unknown[];
      changed: unknown[];
      unchanged: unknown[];
      totals: { added: number; removed: number; changed: number };
    };
    links: { swap: string; page: string };
  };
}

describe('GET /api/runs/compare', () => {
  it('rejects a missing baseline with 400', async () => {
    const response = await GET(request(`candidate=${candidateRun.id}`));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/baseline/i);
  });

  it('rejects a missing candidate with 400', async () => {
    const response = await GET(request(`base=${baseRun.id}`));
    expect(response.status).toBe(400);
  });

  it('rejects comparing a run with itself', async () => {
    const response = await GET(request(`base=${baseRun.id}&candidate=${baseRun.id}`));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/two different runs/i);
  });

  it('returns 404 when either run does not exist', async () => {
    const missingBase = await GET(request(`base=does-not-exist&candidate=${candidateRun.id}`));
    expect(missingBase.status).toBe(404);

    const missingCandidate = await GET(request(`base=${baseRun.id}&candidate=does-not-exist`));
    expect(missingCandidate.status).toBe(404);
  });

  it('returns both sides and a delta for a valid pair', async () => {
    const response = await GET(request(`base=${baseRun.id}&candidate=${candidateRun.id}`));
    expect(response.status).toBe(200);

    const body = (await response.json()) as CompareBody;
    expect(body.data.base.runId).toBe(baseRun.id);
    expect(body.data.candidate.runId).toBe(candidateRun.id);
    expect(body.data.base.signatureCount).toBeGreaterThan(0);
    expect(body.data.candidate.signatureCount).toBeGreaterThan(0);
    expect(body.data.base.metrics.seeds).toBe(baseRun.seedCount);
    expect(body.data.delta.unchanged).toBeInstanceOf(Array);
    expect(typeof body.data.delta.totals.added).toBe('number');
  });

  it('applies the failure-class filter to both sides', async () => {
    const response = await GET(
      request(`base=${baseRun.id}&candidate=${candidateRun.id}&failureClass=no-such-class`),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as CompareBody;
    expect(body.data.base.signatureCount).toBe(0);
    expect(body.data.candidate.signatureCount).toBe(0);
    expect(body.data.filters.failureClass).toBe('no-such-class');
  });

  it('advertises a swap link and a page link', async () => {
    const response = await GET(request(`base=${baseRun.id}&candidate=${candidateRun.id}`));
    const body = (await response.json()) as CompareBody;

    expect(body.data.links.swap).toContain(`base=${candidateRun.id}`);
    expect(body.data.links.swap).toContain(`candidate=${baseRun.id}`);
    expect(body.data.links.page.startsWith('/compare?')).toBe(true);
  });
});
