import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuzzingRun } from '@/app/types';

const state = vi.hoisted(() => {
  const runs: FuzzingRun[] = [];
  const driver = {
    name: 'test-runs',
    async listRuns() {
      return { runs, total: runs.length };
    },
    async getRun(id: string) {
      return runs.find((run) => run.id === id) ?? null;
    },
    async putArtifact() {
      throw new Error('not implemented');
    },
    async getArtifact() {
      return null;
    },
    async deleteRun() {
      return false;
    },
  };
  return { runs, driver };
});

vi.mock('@/lib/storage', () => ({
  selectRunStorageDriver: () => state.driver,
}));

import { resetRunSearchIndex } from '@/lib/search/server-index';
import type { RunSearchResponse } from '@/lib/schemas/runs';
import { GET } from './route';

function makeRun(id: string, overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id,
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    queuedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

async function request(query: string): Promise<{
  status: number;
  data: RunSearchResponse;
  total?: number;
}> {
  const response = await GET(
    new Request(`http://localhost/api/runs/search?${query}`),
  );
  const json = (await response.json()) as {
    data: RunSearchResponse;
    total?: number;
  };
  return { status: response.status, data: json.data, total: json.total };
}

beforeEach(() => {
  state.runs.length = 0;
  resetRunSearchIndex(state.driver);
  vi.stubEnv('NEXT_PUBLIC_API_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/runs/search', () => {
  it('returns an empty result set for an empty query', async () => {
    state.runs.push(makeRun('run-1'));

    const result = await request('q=');
    expect(result.status).toBe(200);
    expect(result.data.results).toEqual([]);
    expect(result.data.indexed).toBe(1);
  });

  it('returns a ranked run for an exact id query', async () => {
    state.runs.push(makeRun('run-0042'), makeRun('run-0042-extra'));

    const result = await request('q=run-0042');
    expect(result.status).toBe(200);
    expect(result.data.results[0]?.run.id).toBe('run-0042');
    expect(result.data.total).toBe(2);
    expect(result.data.truncated).toBe(false);
  });

  it('returns a no-results response without an error', async () => {
    state.runs.push(makeRun('run-1'));

    const result = await request('q=does-not-exist');
    expect(result.status).toBe(200);
    expect(result.data.results).toEqual([]);
    expect(result.data.total).toBe(0);
    expect(result.data.truncated).toBe(false);
    expect(result.data.hint).toBeUndefined();
  });

  it('caps results at 200 and includes the narrow-your-query hint', async () => {
    for (let index = 0; index < 250; index += 1) {
      state.runs.push(makeRun(`run-${index.toString().padStart(4, '0')}`));
    }

    const result = await request('q=run&limit=200');
    expect(result.data.results).toHaveLength(200);
    expect(result.data.total).toBe(250);
    expect(result.data.truncated).toBe(true);
    expect(result.data.hint).toMatch(/narrow your query/i);
  });

  it('honours the limit parameter and clamps it to 200', async () => {
    for (let index = 0; index < 20; index += 1) {
      state.runs.push(makeRun(`run-${index.toString().padStart(3, '0')}`));
    }

    const limited = await request('q=run&limit=5');
    expect(limited.data.results).toHaveLength(5);

    const clamped = await request('q=run&limit=9999');
    expect(clamped.data.results).toHaveLength(20);
  });

  it('supports grammar queries and reports syntax errors without failing the request', async () => {
    state.runs.push(
      makeRun('run-1', { status: 'failed' }),
      makeRun('run-2', { status: 'completed' }),
    );

    const filtered = await request(`q=${encodeURIComponent('status:failed')}`);
    expect(filtered.data.results.map((hit) => hit.run.id)).toEqual(['run-1']);

    const invalid = await request(`q=${encodeURIComponent('status:')}`);
    expect(invalid.status).toBe(200);
    expect(invalid.data.results).toEqual([]);
    expect(invalid.data.error?.message).toBeTruthy();
    expect(invalid.data.error?.position).toBeGreaterThanOrEqual(0);
  });
});
