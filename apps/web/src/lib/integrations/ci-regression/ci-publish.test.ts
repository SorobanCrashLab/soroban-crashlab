import { describe, expect, it } from 'vitest';
import { publishCiResult, resultFromEnvironment } from './ci-publish';
import type { CiRegressionResult, RegressionSuiteReport } from './types';

const REPORT: RegressionSuiteReport = {
  schema: 1,
  total: 2,
  passed: 1,
  failed: 1,
  cases: [
    { seed_id: 42, mode: 'invoker', expected_failure_class: 'xdr', actual_failure_class: 'xdr', passed: true, error: null },
    { seed_id: 7, mode: 'invoker', expected_failure_class: 'auth', actual_failure_class: 'empty-input', passed: false, error: null },
  ],
};

const SHA = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';

describe('resultFromEnvironment', () => {
  it('maps the Actions environment onto the ingest payload', () => {
    const result = resultFromEnvironment(
      REPORT,
      { schema: 1, knownFailures: [] },
      {
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_SHA: 'f'.repeat(40),
        CI_HEAD_SHA: SHA,
        GITHUB_EVENT_NAME: 'pull_request',
        CI_PR_NUMBER: '12',
        GITHUB_REF: 'refs/pull/12/merge',
        GITHUB_RUN_ID: '555',
        GITHUB_RUN_ATTEMPT: '2',
      },
      new Date('2026-10-16T00:00:00.000Z'),
    );
    expect(result).toMatchObject({
      repository: 'o/r',
      commitSha: SHA,
      prNumber: 12,
      event: 'pull_request',
      suiteRunId: '555-2',
      runUrl: 'https://github.com/o/r/actions/runs/555',
      completedAt: '2026-10-16T00:00:00.000Z',
    });
    expect(result.fixtures.map((f) => f.classification)).toEqual(['new', 'unchanged']);
  });

  it('treats non-PR events as having no PR and unknown events as workflow_dispatch', () => {
    const result = resultFromEnvironment(REPORT, { schema: 1, knownFailures: [] }, {
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_SHA: SHA,
      GITHUB_EVENT_NAME: 'merge_group',
      CI_PR_NUMBER: '',
    });
    expect(result.prNumber).toBeNull();
    expect(result.event).toBe('workflow_dispatch');
    expect(result.runUrl).toBeNull();
  });

  it('requires a repository and commit', () => {
    expect(() => resultFromEnvironment(REPORT, { schema: 1, knownFailures: [] }, {})).toThrow(/GITHUB_REPOSITORY/);
  });
});

function result(): CiRegressionResult {
  return resultFromEnvironment(REPORT, { schema: 1, knownFailures: [] }, {
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_SHA: SHA,
    GITHUB_EVENT_NAME: 'pull_request',
    CI_PR_NUMBER: '12',
    GITHUB_RUN_ID: '1',
  });
}

function recorder() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line), sleep: async () => {} };
}

const failingFetch = (async () => {
  throw new Error('connect ECONNREFUSED');
}) as unknown as typeof fetch;

describe('publishCiResult — post-failure tolerance (report-only phase)', () => {
  it('turns GitHub and dashboard failures into warnings and exits 0', async () => {
    const out = recorder();
    const code = await publishCiResult(
      result(),
      { GITHUB_TOKEN: 't', CRASHLAB_API_URL: 'https://crashlab.example', CRASHLAB_CI_TOKEN: 'scl_live_x' },
      { fetchImpl: failingFetch, ...out },
    );
    expect(code).toBe(0);
    const warnings = out.lines.filter((l) => l.startsWith('::warning::'));
    expect(warnings).toHaveLength(3); // comment, check run, dashboard
    expect(out.lines.some((l) => l.startsWith('::error::'))).toBe(false);
  });

  it('fails only the dashboard post once CRASHLAB_CI_REPORT_STRICT=true (flip point)', async () => {
    const out = recorder();
    const code = await publishCiResult(
      result(),
      { CRASHLAB_API_URL: 'https://crashlab.example', CRASHLAB_CI_TOKEN: 'x', CRASHLAB_CI_REPORT_STRICT: 'true' },
      { fetchImpl: failingFetch, ...out },
    );
    expect(code).toBe(1);
    expect(out.lines.at(-1)).toMatch(/^::error::Could not post results to the dashboard/);
  });

  it('skips the dashboard when it is not configured', async () => {
    const out = recorder();
    const code = await publishCiResult(result(), {}, { fetchImpl: failingFetch, ...out });
    expect(code).toBe(0);
    expect(out.lines.at(-1)).toMatch(/skipping dashboard post/);
  });

  it('retries transient dashboard errors and posts with the CI token', async () => {
    const out = recorder();
    const seen: Array<{ url: string; auth: string | null }> = [];
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') });
      calls += 1;
      return calls === 1 ? new Response('busy', { status: 503 }) : new Response('{}', { status: 201 });
    }) as typeof fetch;

    const code = await publishCiResult(
      result(),
      { CRASHLAB_API_URL: 'https://crashlab.example/', CRASHLAB_CI_TOKEN: 'scl_live_x' },
      { fetchImpl, ...out },
    );
    expect(code).toBe(0);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ url: 'https://crashlab.example/api/integrations/ci/results', auth: 'Bearer scl_live_x' });
    expect(out.lines.at(-1)).toBe('dashboard post: created');
  });

  it('does not retry a client error such as a rejected token', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{"error":"Invalid API key."}', { status: 401 });
    }) as unknown as typeof fetch;
    const code = await publishCiResult(
      result(),
      { CRASHLAB_API_URL: 'https://crashlab.example', CRASHLAB_CI_TOKEN: 'bad' },
      { fetchImpl, ...recorder() },
    );
    expect(code).toBe(0);
    expect(calls).toBe(1);
  });
});
