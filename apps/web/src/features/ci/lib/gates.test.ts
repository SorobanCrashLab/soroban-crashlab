import { describe, expect, it } from 'vitest';
import { DEFAULT_GATE_POLICY, type CiRun, type GateMetric } from './model';
import {
  evaluateGate,
  evaluateGates,
  formatGateValue,
  gateObservationsFromRuns,
  type GateObservation,
} from './gates';

function run(metrics: GateMetric[], overrides: Partial<CiRun> = {}): CiRun {
  return {
    id: 'run-1',
    workflowName: 'CI',
    event: 'push',
    branch: 'main',
    commitSha: 'a'.repeat(40),
    commitMessage: 'test',
    author: 'dev',
    attempt: 1,
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-11-23T08:00:00.000Z',
    updatedAt: '2026-11-23T08:10:00.000Z',
    durationMs: 1_000,
    jobs: [],
    checks: [],
    artifacts: [],
    metrics,
    codeAreas: ['web'],
    ...overrides,
  };
}

function observation(kind: GateObservation['kind'], values: Partial<GateObservation> = {}): GateObservation {
  return { kind, status: 'pass', artifacts: [], ...values };
}

describe('evaluateGate budgets', () => {
  it('passes coverage above the floor and warns for a tiny dip', () => {
    const pass = evaluateGate(
      observation('coverage', { value: 82, baseline: 82.2, unit: '%' }),
    );
    const warn = evaluateGate(
      observation('coverage', { value: 79.8, baseline: 80.1, unit: '%' }),
    );
    const fail = evaluateGate(
      observation('coverage', { value: 79, baseline: 80.1, unit: '%' }),
    );
    expect(pass.status).toBe('pass');
    expect(warn.status).toBe('warn');
    expect(warn.deltaLabel).toBe('-0.3 pp');
    expect(fail.status).toBe('fail');
    expect(fail.budget?.target).toBe(80);
  });

  it('applies perf and visual delta tolerances', () => {
    const small = evaluateGate(
      observation('perf', { value: 1_850, baseline: 1_800, unit: 'ms' }),
    );
    const large = evaluateGate(
      observation('perf', { value: 2_000, baseline: 1_800, unit: 'ms' }),
    );
    expect(small.status).toBe('warn');
    expect(large.status).toBe('fail');
    expect(large.deltaLabel).toBe('+11.11%');
    const visual = evaluateGate(
      observation('visual', { value: 0.6, baseline: 0.55, unit: '%' }),
    );
    expect(visual.status).toBe('warn');
  });

  it('evaluates vulnerability budgets and failed execution status', () => {
    const security = evaluateGate(
      observation('security', { security: { critical: 0, high: 3 } }),
    );
    expect(security.status).toBe('fail');
    expect(security.reasons[0]).toContain('3 high');
    const failedLint = evaluateGate(observation('lint', { status: 'fail' }));
    expect(failedLint.status).toBe('fail');
    const skipped = evaluateGate(observation('mutation', { status: 'skip' }));
    expect(skipped.status).toBe('skip');
  });

  it('formats values for display', () => {
    expect(formatGateValue(evaluateGate(observation('coverage', { value: 81.5, unit: '%' })))).toBe('81.5%');
    expect(formatGateValue(evaluateGate(observation('perf', { value: 1900, unit: 'ms' })))).toBe('1900 ms');
  });
});

describe('gateObservationsFromRuns / evaluateGates', () => {
  it('derives observations from jobs, checks and metrics, then evaluates all gates', () => {
    const runs = [
      run(
        [
          { kind: 'coverage', name: 'coverage.pct', value: 79.4, baseline: 81, unit: '%' },
          { kind: 'security', name: 'security.critical', value: 1, unit: 'CVEs' },
          { kind: 'security', name: 'security.high', value: 1, unit: 'CVEs' },
        ],
        {
          jobs: [
            {
              id: 'j1',
              name: 'unit-tests',
              workflowName: 'CI',
              status: 'completed',
              conclusion: 'success',
              durationMs: 100,
              steps: [],
              artifacts: [],
              gates: ['test', 'coverage'],
            },
          ],
          checks: [
            {
              id: 'c1',
              name: 'security',
              conclusion: 'failure',
              status: 'completed',
              required: true,
              gate: 'security',
            },
          ],
        },
      ),
    ];
    const observations = gateObservationsFromRuns(runs);
    const coverage = observations.find((item) => item.kind === 'coverage');
    expect(coverage?.value).toBe(79.4);
    expect(coverage?.baseline).toBe(81);
    const security = observations.find((item) => item.kind === 'security');
    expect(security?.security).toEqual({ critical: 1, high: 1 });
    expect(security?.status).toBe('fail');

    const evaluation = evaluateGates(observations, DEFAULT_GATE_POLICY, '2026-11-23T09:00:00.000Z');
    expect(evaluation.cards).toHaveLength(8);
    expect(evaluation.blockers.map((card) => card.kind)).toContain('coverage');
    expect(evaluation.blockers.map((card) => card.kind)).toContain('security');
    expect(evaluation.cards.find((card) => card.kind === 'visual')?.status).toBe('skip');
    expect(evaluation.evaluatedAt).toBe('2026-11-23T09:00:00.000Z');
  });

  it('lets the worst status win across reruns', () => {
    const failed = run([], {
      id: 'old',
      jobs: [
        {
          id: 'j1',
          name: 'e2e',
          workflowName: 'CI',
          status: 'completed',
          conclusion: 'failure',
          durationMs: 100,
          steps: [],
          artifacts: [],
          gates: ['e2e'],
        },
      ],
      updatedAt: '2026-11-23T08:00:00.000Z',
    });
    const passed = run([], {
      id: 'new',
      attempt: 2,
      jobs: [
        {
          id: 'j2',
          name: 'e2e',
          workflowName: 'CI',
          status: 'completed',
          conclusion: 'success',
          durationMs: 100,
          steps: [],
          artifacts: [],
          gates: ['e2e'],
        },
      ],
      updatedAt: '2026-11-23T09:00:00.000Z',
    });
    const e2e = gateObservationsFromRuns([failed, passed]).find((item) => item.kind === 'e2e');
    expect(e2e?.status).toBe('fail');
  });
});
