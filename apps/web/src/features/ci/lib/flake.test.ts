import { describe, expect, it } from 'vitest';
import { flakeLeaderboard, outcomesFromRuns, scoreFlake, scoreFlakes, type TestOutcome } from './flake';
import type { CiRun } from './model';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const day = 86_400_000;

function outcome(status: TestOutcome['status'], atDaysAgo: number, attempt = 1): TestOutcome {
  return {
    testId: 'suite::job::checkout.spec',
    name: 'checkout.spec',
    runId: `run-${atDaysAgo}-${attempt}`,
    at: new Date(NOW - atDaysAgo * day).toISOString(),
    attempt,
    status,
    jobName: 'e2e',
    codeAreas: ['checkout', 'billing'],
  };
}

describe('scoreFlake', () => {
  it('scores alternating pass/fail history higher than a steady failure', () => {
    const flapping = [
      outcome('pass', 10),
      outcome('fail', 8),
      outcome('pass', 6),
      outcome('fail', 4, 2),
      outcome('pass', 1, 3),
      outcome('fail', 0, 4),
    ];
    const steady = [
      outcome('pass', 10),
      outcome('pass', 8),
      outcome('pass', 6),
      outcome('fail', 4),
      outcome('fail', 1),
      outcome('fail', 0),
    ];
    const flapScore = scoreFlake('t', 'checkout.spec', flapping, { nowMs: NOW });
    const steadyScore = scoreFlake('t', 'checkout.spec', steady, { nowMs: NOW });
    expect(flapScore.flips).toBe(5);
    expect(flapScore.recoveries).toBe(1);
    expect(flapScore.score).toBeGreaterThan(steadyScore.score);
    expect(flapScore.severity).toBe('critical');
    expect(flapScore.evidence.join(' ')).toContain('billing, checkout');
  });

  it('requires both outcomes and a minimum sample count', () => {
    const two = [outcome('pass', 2), outcome('fail', 1)];
    expect(scoreFlake('t', 't', two, { nowMs: NOW }).isFlaky).toBe(false);
    const allPass = [outcome('pass', 3), outcome('pass', 2), outcome('pass', 1)];
    expect(scoreFlake('t', 't', allPass, { nowMs: NOW }).score).toBe(0);
  });

  it('is deterministic across input order', () => {
    const history = [outcome('pass', 3), outcome('fail', 2, 2), outcome('pass', 1, 3)];
    const a = scoreFlake('t', 't', history, { nowMs: NOW });
    const b = scoreFlake('t', 't', [...history].reverse(), { nowMs: NOW });
    expect(a).toEqual(b);
  });
});

describe('outcomesFromRuns / leaderboard', () => {
  function run(id: string, conclusion: string, atDaysAgo: number, attempt = 1): CiRun {
    return {
      id,
      workflowName: 'CI',
      event: 'push',
      branch: 'main',
      commitSha: 'a'.repeat(40),
      commitMessage: 'test',
      author: 'qa',
      attempt,
      status: 'completed',
      conclusion,
      createdAt: new Date(NOW - atDaysAgo * day).toISOString(),
      updatedAt: new Date(NOW - atDaysAgo * day).toISOString(),
      durationMs: 1_000,
      jobs: [
        {
          id: `job-${id}`,
          name: 'e2e',
          workflowName: 'CI',
          status: 'completed',
          conclusion,
          durationMs: 1_000,
          steps: [
            {
              id: 's1',
              name: 'playwright checkout.spec',
              number: 1,
              status: 'completed',
              conclusion,
              durationMs: 1_000,
              annotations: [],
            },
            {
              id: 's2',
              name: 'Upload artifact',
              number: 2,
              status: 'completed',
              conclusion,
              durationMs: 1,
              annotations: [],
            },
          ],
          artifacts: [],
          gates: ['e2e'],
        },
      ],
      checks: [],
      artifacts: [],
      metrics: [],
      codeAreas: ['checkout'],
    };
  }

  it('ignores non-test steps and builds a ranked leaderboard', () => {
    const runs = [
      run('r1', 'success', 6),
      run('r2', 'failure', 5),
      run('r3', 'success', 4),
      run('r4', 'failure', 3, 2),
      run('r5', 'success', 2, 3),
      run('r6', 'failure', 1, 4),
    ];
    const outcomes = outcomesFromRuns(runs);
    expect(outcomes).toHaveLength(6);
    expect(scoreFlakes(outcomes, { nowMs: NOW })).toHaveLength(1);
    const leaderboard = flakeLeaderboard(runs, { nowMs: NOW });
    expect(leaderboard[0].name).toBe('playwright checkout.spec');
    expect(leaderboard[0].score).toBeGreaterThan(0);
  });
});
