import { describe, expect, it } from 'vitest';
import {
  correlateFailure,
  correlateFailures,
  failureSignalsFromRuns,
  toCandidates,
  tokenize,
  type FailureSignal,
} from './correlation';
import type { CiRun } from './model';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');

const signal: FailureSignal = {
  id: 'run-1:job-1:step-1',
  runId: 'run-1',
  jobName: 'e2e checkout',
  stepName: 'playwright checkout.spec',
  message: 'billing summary timeout',
  codeAreas: ['checkout', 'billing'],
  occurredAt: '2026-11-23T08:00:00.000Z',
};

const candidates = toCandidates({
  regressions: [
    {
      id: 'reg-1',
      fingerprint: 'checkout billing timeout',
      title: 'Checkout billing summary timeout',
      status: 'investigating',
      detectedAt: '2026-11-22T08:00:00.000Z',
      areas: ['checkout', 'billing'],
    },
  ],
  incidents: [
    {
      id: 'inc-1',
      title: 'Billing RPC degradation',
      severity: 'major',
      startedAt: '2026-11-22T08:00:00.000Z',
      areas: ['billing'],
    },
  ],
  changes: [
    {
      id: 'chg-1',
      title: 'Refactor summary totals',
      author: 'dev',
      mergedAt: '2026-11-22T08:00:00.000Z',
      areas: ['unrelated'],
      files: ['docs/readme.md'],
    },
  ],
});

describe('tokenize', () => {
  it('normalizes, deduplicates and removes noise words', () => {
    expect(tokenize('The checkout CHECKOUT failed for billing!')).toEqual(['billing', 'checkout']);
  });
});

describe('correlateFailure', () => {
  it('ranks fingerprint matches above area/token matches', () => {
    const matches = correlateFailure(signal, candidates, NOW);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0].id).toBe('reg-1');
    expect(matches[0].rule).toBe('fingerprint');
    expect(matches[0].confidence).toBeGreaterThan(matches[1].confidence);
    expect(matches[0].evidence.join(' ')).toContain('Shared code area');
  });

  it('drops candidates outside the time window and sorts deterministically', () => {
    const stale = correlateFailure(signal, [
      { ...candidates[0], occurredAt: '2026-09-01T00:00:00.000Z' },
      candidates[1],
      candidates[2],
    ], NOW);
    expect(stale.map((item) => item.id)).not.toContain('reg-1');
    expect(correlateFailure(signal, candidates, NOW)).toEqual(correlateFailure(signal, candidates, NOW));
  });

  it('does not produce a match without shared evidence', () => {
    expect(
      correlateFailure(
        { ...signal, message: 'unrelated issue', codeAreas: ['docs'], jobName: 'lint', stepName: 'eslint' },
        [candidates[2]],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('failureSignalsFromRuns / correlateFailures', () => {
  const run: CiRun = {
    id: 'run-1',
    workflowName: 'CI',
    event: 'pull_request',
    branch: 'feat',
    commitSha: 'a'.repeat(40),
    commitMessage: 'feat',
    author: 'dev',
    attempt: 1,
    status: 'completed',
    conclusion: 'failure',
    createdAt: '2026-11-23T08:10:00.000Z',
    updatedAt: '2026-11-23T08:00:00.000Z',
    durationMs: 100,
    jobs: [
      {
        id: 'job-1',
        name: 'e2e checkout',
        workflowName: 'CI',
        status: 'completed',
        conclusion: 'failure',
        durationMs: 100,
        steps: [
          {
            id: 'step-1',
            name: 'playwright checkout.spec',
            number: 1,
            status: 'completed',
            conclusion: 'failure',
            durationMs: 100,
            annotations: [
              { level: 'failure', message: 'billing summary timeout in checkout' },
            ],
          },
        ],
        artifacts: [],
        gates: ['e2e'],
      },
    ],
    checks: [
      {
        id: 'chk-1',
        name: 'Required E2E',
        conclusion: 'failure',
        status: 'completed',
        required: true,
      },
    ],
    artifacts: [],
    metrics: [],
    codeAreas: ['checkout', 'billing'],
  };

  it('merges evidence from multiple signals per candidate', () => {
    const signals = failureSignalsFromRuns([run]);
    expect(signals).toHaveLength(2);
    const correlated = correlateFailures(
      [run],
      {
        regressions: [
          {
            id: 'reg-1',
            fingerprint: 'checkout billing timeout',
            title: 'Checkout billing summary timeout',
            status: 'open',
            detectedAt: '2026-11-22T08:00:00.000Z',
            areas: ['checkout', 'billing'],
          },
        ],
        incidents: [],
        changes: [],
      },
      NOW,
    );
    expect(correlated).toHaveLength(1);
    expect(correlated[0].signals.length).toBeGreaterThanOrEqual(2);
  });
});
