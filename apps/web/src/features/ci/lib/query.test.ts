import { describe, expect, it } from 'vitest';
import type { CiRun } from './model';
import { filterRunsForQuery, parseCiQuery } from './query';

function run(overrides: Partial<CiRun> = {}): CiRun {
  return {
    id: 'run-1',
    workflowName: 'CI',
    event: 'pull_request',
    branch: 'feat',
    commitSha: 'a'.repeat(40),
    commitMessage: 'feat: checkout fix',
    prNumber: 2314,
    author: 'alice',
    attempt: 1,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-11-23T08:00:00.000Z',
    updatedAt: '2026-11-23T08:10:00.000Z',
    durationMs: 100,
    jobs: [],
    checks: [],
    artifacts: [],
    metrics: [],
    codeAreas: ['checkout'],
    ...overrides,
  };
}

describe('parseCiQuery', () => {
  it('parses valid params and ignores unknown ones', () => {
    const result = parseCiQuery(new URLSearchParams('view=pr&pr=2314&limit=10&unknown=x'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.query).toMatchObject({ view: 'pr', pr: 2314, limit: 10 });
  });

  it('defaults view and limit for an empty query', () => {
    const result = parseCiQuery(new URLSearchParams());
    expect(result.ok && result.query).toMatchObject({ view: 'all', limit: 50 });
  });

  it('returns field errors for invalid params', () => {
    const result = parseCiQuery(new URLSearchParams('view=nope&sha=xyz&limit=0'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('sha');
  });
});

describe('filterRunsForQuery', () => {
  const runs = [
    run(),
    run({ id: 'run-2', event: 'push', branch: 'main', prNumber: undefined }),
    run({ id: 'run-3', event: 'schedule', branch: 'main', prNumber: undefined }),
    run({ id: 'run-4', conclusion: 'failure', prNumber: 2300 }),
    run({
      id: 'run-5',
      attempt: 2,
      rerunOf: 'run-4',
      conclusion: 'success',
      prNumber: 2300,
      updatedAt: '2026-11-23T09:00:00.000Z',
    }),
  ];

  it('filters by view, pr, search and status', () => {
    expect(filterRunsForQuery(runs, { view: 'pr', limit: 50 }).map((item) => item.id)).toEqual([
      'run-5',
      'run-1',
    ]);
    expect(filterRunsForQuery(runs, { view: 'branch', branch: 'main', limit: 50 }).map((item) => item.id)).toEqual([
      'run-2',
      'run-3',
    ]);
    expect(filterRunsForQuery(runs, { view: 'release', limit: 50 }).map((item) => item.id)).toEqual(['run-3']);
    expect(filterRunsForQuery(runs, { view: 'all', q: 'checkout', limit: 50 })).toHaveLength(4);
    expect(filterRunsForQuery(runs, { view: 'all', pr: 2300, limit: 50 }).map((item) => item.id)).toEqual(['run-5']);
  });

  it('uses the latest rerun and truncates to the limit', () => {
    expect(filterRunsForQuery(runs, { view: 'all', limit: 2 })).toHaveLength(2);
    expect(filterRunsForQuery(runs, { view: 'all', limit: 50 }).some((item) => item.id === 'run-4')).toBe(false);
  });
});
