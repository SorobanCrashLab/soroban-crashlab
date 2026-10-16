import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { CI_RESULTS_RATE_LIMIT, ciResultsRateLimiter } from '@/lib/integrations/ci-regression/ingest-limits';
import type { CiRegressionResult } from '@/lib/integrations/ci-regression/types';
import { createApiToken, resetApiTokenStore } from '@/lib/storage/api-token-store';
import { InMemoryCiResultsStore, resetCiResultsStore } from '@/lib/storage/ci-results-store';

const URL_BASE = 'http://localhost/api/integrations/ci/results';
const SHA = '0123456789abcdef0123456789abcdef01234567';

function payload(overrides: Partial<CiRegressionResult> = {}): CiRegressionResult {
  return {
    schemaVersion: 1,
    repository: 'SorobanCrashLab/soroban-crashlab',
    commitSha: SHA,
    prNumber: 1890,
    ref: 'refs/pull/1890/merge',
    event: 'pull_request',
    suiteRunId: '1000-1',
    runUrl: 'https://github.com/SorobanCrashLab/soroban-crashlab/actions/runs/1000',
    completedAt: '2026-10-16T00:00:00.000Z',
    fixtures: [
      {
        id: 'seed-3-invoker',
        seedId: 3,
        mode: 'invoker',
        expectedClass: 'auth',
        actualClass: 'state',
        outcome: 'fail',
        classification: 'new',
        baselineSignature: null,
        error: null,
      },
      {
        id: 'seed-42-invoker',
        seedId: 42,
        mode: 'invoker',
        expectedClass: 'xdr',
        actualClass: 'xdr',
        outcome: 'pass',
        classification: 'unchanged',
        baselineSignature: null,
        error: null,
      },
    ],
    artifacts: [],
    ...overrides,
  };
}

function post(body: unknown, token?: string): Promise<Response> {
  return POST(
    new NextRequest(URL_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function get(query = ''): Promise<Response> {
  return GET(new NextRequest(`${URL_BASE}${query}`));
}

let ciToken: string;

beforeEach(() => {
  delete process.env.CRASHLAB_WEBHOOK_API_KEY;
  delete process.env.CRASHLAB_CI_REPOSITORY;
  resetApiTokenStore();
  resetCiResultsStore(new InMemoryCiResultsStore());
  ciResultsRateLimiter.reset();
  ciToken = createApiToken({ name: 'ci', scopes: ['ci:write'] }).secret;
});

afterEach(() => {
  delete process.env.CRASHLAB_CI_REPOSITORY;
  resetCiResultsStore();
});

describe('POST /api/integrations/ci/results — auth', () => {
  it('rejects a request without a token', async () => {
    expect((await post(payload())).status).toBe(401);
  });

  it('rejects an unknown token', async () => {
    expect((await post(payload(), 'scl_live_nope')).status).toBe(401);
  });

  it('rejects a token without the ci:write scope', async () => {
    const runsOnly = createApiToken({ name: 'runs', scopes: ['runs:write'] }).secret;
    const res = await post(payload(), runsOnly);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('INSUFFICIENT_SCOPE');
  });

  it('accepts a ci:write token and recomputes the deltas server side', async () => {
    const res = await post(payload(), ciToken);
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replayed')).toBe('false');
    const body = await res.json();
    expect(body.data.result.id).toBe(`${SHA}:1000-1`);
    expect(body.data.result.deltas).toEqual({ new: 1, recurring: 0, fixed: 0, unchanged: 1, total: 2, blocking: 1 });
  });
});

describe('POST /api/integrations/ci/results — validation', () => {
  it('returns field errors for a malformed payload', async () => {
    const res = await post(payload({ commitSha: 'not-a-sha', suiteRunId: '../x' }), ciToken);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.fieldErrors)).toEqual(expect.arrayContaining(['commitSha', 'suiteRunId']));
  });

  it('rejects a classification that contradicts the outcome', async () => {
    const tampered = payload();
    tampered.fixtures[0] = { ...tampered.fixtures[0], classification: 'unchanged' };
    const res = await post(tampered, ciToken);
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors['fixtures.0.classification']).toBeDefined();
  });

  it('rejects unknown fields, duplicate fixtures and non-https links', async () => {
    expect((await post({ ...payload(), extra: true }, ciToken)).status).toBe(400);
    const dup = payload();
    dup.fixtures = [dup.fixtures[0], dup.fixtures[0]];
    expect((await post(dup, ciToken)).status).toBe(400);
    expect((await post(payload({ runUrl: 'javascript:alert(1)' }), ciToken)).status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    expect((await post('{', ciToken)).status).toBe(400);
  });
});

describe('POST /api/integrations/ci/results — trust model', () => {
  it('only accepts the configured repository when CRASHLAB_CI_REPOSITORY is set', async () => {
    process.env.CRASHLAB_CI_REPOSITORY = 'SorobanCrashLab/soroban-crashlab';
    const other = await post(payload({ repository: 'attacker/fork' }), ciToken);
    expect(other.status).toBe(403);
    expect((await other.json()).code).toBe('CI_REPOSITORY_NOT_ALLOWED');

    // Case-insensitive, like GitHub repository names.
    expect((await post(payload({ repository: 'sorobancrashlab/Soroban-CrashLab' }), ciToken)).status).toBe(201);
  });
});

describe('POST /api/integrations/ci/results — idempotency by (sha, suite run)', () => {
  it('replays an identical retry and rejects a different payload for the same key', async () => {
    expect((await post(payload(), ciToken)).status).toBe(201);

    const retry = await post(payload(), ciToken);
    expect(retry.status).toBe(200);
    expect(retry.headers.get('Idempotent-Replayed')).toBe('true');

    const changed = await post(payload({ completedAt: '2026-10-16T01:00:00.000Z' }), ciToken);
    expect(changed.status).toBe(409);
    expect((await changed.json()).code).toBe('CI_RESULT_CONFLICT');

    // A re-run attempt is a new suite run.
    expect((await post(payload({ suiteRunId: '1000-2' }), ciToken)).status).toBe(201);
    expect((await (await get()).json()).data.results).toHaveLength(2);
  });
});

describe('POST /api/integrations/ci/results — rate limit', () => {
  it('limits posts per credential with Retry-After', async () => {
    for (let i = 0; i < CI_RESULTS_RATE_LIMIT; i++) {
      expect((await post(payload({ suiteRunId: `run-${i}` }), ciToken)).status).toBe(201);
    }
    const limited = await post(payload({ suiteRunId: 'one-more' }), ciToken);
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);

    // Another credential has its own window.
    const other = createApiToken({ name: 'ci-2', scopes: ['ci:write'] }).secret;
    expect((await post(payload({ suiteRunId: 'other' }), other)).status).toBe(201);
  });
});

describe('GET /api/integrations/ci/results', () => {
  it('lists newest first and filters by PR and commit', async () => {
    const otherSha = 'f'.repeat(40);
    await post(payload({ suiteRunId: 'a' }), ciToken);
    await post(payload({ suiteRunId: 'b', commitSha: otherSha, prNumber: null, event: 'schedule' }), ciToken);

    const all = (await (await get()).json()).data.results;
    expect(all.map((r: { id: string }) => r.id)).toEqual([`${otherSha}:b`, `${SHA}:a`]);

    const byPr = (await (await get('?pr=1890')).json()).data.results;
    expect(byPr.map((r: { id: string }) => r.id)).toEqual([`${SHA}:a`]);

    const bySha = (await (await get(`?sha=${otherSha}`)).json()).data.results;
    expect(bySha).toHaveLength(1);
    expect(bySha[0].result.event).toBe('schedule');
  });

  it('validates query parameters', async () => {
    expect((await get('?sha=xyz')).status).toBe(400);
    expect((await get('?pr=-1')).status).toBe(400);
    expect((await get('?limit=1000')).status).toBe(400);
  });
});
