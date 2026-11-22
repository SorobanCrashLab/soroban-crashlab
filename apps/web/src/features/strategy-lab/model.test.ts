import { describe, expect, it } from 'vitest';
import {
  compareExperiments,
  diffStrategies,
  evaluateRolloutGuard,
  normalizeWeights,
  recommend,
  serializeStrategy,
  validateStrategy,
  type Experiment,
  type Strategy,
} from './model';

const baseStrategy: Strategy = {
  id: 's1',
  name: 'Balanced v1',
  version: 1,
  schedule: 'fixed',
  constraints: { maxInputBytes: 4096, maxMutatorsPerCase: 3 },
  tags: ['baseline', 'v1'],
  mutators: [
    { id: 'bitflip', kind: 'bitflip', weight: 70, enabled: true },
    { id: 'slice', kind: 'slice', weight: 30, enabled: true },
  ],
};

const experiment: Experiment = {
  id: 'e1',
  baselineId: 's1',
  candidateId: 's2',
  baseline: { coveragePct: 60, uniqueCrashes: 4, timeToFirstCrashSec: 120, execPerSec: 900, costUsd: 10 },
  candidate: { coveragePct: 66, uniqueCrashes: 7, timeToFirstCrashSec: 90, execPerSec: 1000, costUsd: 12 },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('validateStrategy', () => {
  it('accepts a valid strategy', () => {
    expect(validateStrategy(baseStrategy)).toEqual([]);
  });

  it('reports missing enabled mutators and invalid constraints', () => {
    const invalid: Strategy = {
      ...baseStrategy,
      mutators: [{ id: 'x', kind: 'bitflip', weight: -1, enabled: false }],
      constraints: { maxInputBytes: 0, maxMutatorsPerCase: 0 },
      version: 0,
    };
    expect(validateStrategy(invalid)).toEqual(expect.arrayContaining([
      'At least one mutator must be enabled',
      'Version must be at least 1',
      'maxInputBytes must be positive',
    ]));
  });
});

describe('normalizeWeights', () => {
  it('normalises to 100% while ignoring disabled mutators', () => {
    const result = normalizeWeights([
      { id: 'a', kind: 'bitflip', weight: 1, enabled: true },
      { id: 'b', kind: 'slice', weight: 3, enabled: true },
      { id: 'c', kind: 'dictionary', weight: 99, enabled: false },
    ]);
    expect(result.find((m) => m.id === 'a')?.weight).toBe(25);
    expect(result.find((m) => m.id === 'b')?.weight).toBe(75);
    expect(result.find((m) => m.id === 'c')?.weight).toBe(99);
  });
});

describe('serializeStrategy', () => {
  it('is independent of mutator and tag ordering', () => {
    const reordered: Strategy = {
      ...baseStrategy,
      tags: [...baseStrategy.tags].reverse(),
      mutators: [...baseStrategy.mutators].reverse(),
    };
    expect(serializeStrategy(reordered)).toBe(serializeStrategy(baseStrategy));
  });
});

describe('diffStrategies', () => {
  it('reports version, schedule and mutator changes', () => {
    const after: Strategy = {
      ...baseStrategy,
      version: 2,
      schedule: 'adaptive',
      mutators: [
        { id: 'bitflip', kind: 'bitflip', weight: 50, enabled: true },
        { id: 'slice', kind: 'slice', weight: 30, enabled: true },
      ],
    };
    const fields = diffStrategies(baseStrategy, after).map((row) => row.field);
    expect(fields).toContain('version');
    expect(fields).toContain('schedule');
    expect(fields).toContain('mutator.bitflip');
    expect(fields).not.toContain('mutator.slice');
  });
});

describe('compareExperiments', () => {
  it('computes deltas and crash yield per dollar', () => {
    expect(compareExperiments(experiment)).toMatchObject({
      coverageDelta: 6,
      uniqueCrashesDelta: 3,
      execPerSecDelta: 100,
      costDelta: 2,
      crashesPerDollar: 0.58,
      timeToFirstCrashDelta: -30,
    });
  });
});

describe('recommend', () => {
  it('flags starving mutators and records improvements', () => {
    const withStarving: Strategy = {
      ...baseStrategy,
      mutators: [...baseStrategy.mutators, { id: 'rare', kind: 'dictionary', weight: 2, enabled: true }],
    };
    const kinds = recommend(experiment, withStarving).map((r) => r.kind);
    expect(kinds).toContain('starving-mutator');
    expect(kinds).toContain('improvement');
  });

  it('flags cost regressions', () => {
    const costly: Experiment = {
      ...experiment,
      candidate: { ...experiment.candidate, uniqueCrashes: 4, costUsd: 30 },
    };
    expect(recommend(costly, baseStrategy).map((r) => r.kind)).toContain('cost-regression');
  });
});

describe('evaluateRolloutGuard', () => {
  it('approves a valid experiment with approvals and permission', () => {
    expect(evaluateRolloutGuard(baseStrategy, experiment, {
      approvals: 2, requiredApprovals: 2, canApply: true,
    }).approved).toBe(true);
  });

  it('blocks rollout on missing approvals or lost crashes', () => {
    const decision = evaluateRolloutGuard(baseStrategy, experiment, {
      approvals: 0, requiredApprovals: 2, canApply: true,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons).toContain('Required approvals not met');

    const worse: Experiment = {
      ...experiment,
      candidate: { ...experiment.candidate, uniqueCrashes: 1 },
    };
    expect(evaluateRolloutGuard(baseStrategy, worse, {
      approvals: 2, requiredApprovals: 2, canApply: true,
    }).reasons).toContain('Candidate discovers fewer crashes than baseline');
  });
});
