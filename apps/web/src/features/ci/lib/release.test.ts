import { describe, expect, it } from 'vitest';
import type { Correlation } from './correlation';
import type { FlakeScore } from './flake';
import { evaluateGates, type GateObservation } from './gates';
import {
  DEFAULT_GATE_POLICY,
  GATE_KINDS,
  type CiCheck,
  type CiRun,
  type IncidentRecord,
  type RegressionRecord,
} from './model';
import { assessReleaseReadiness } from './release';

const NOW = Date.parse('2026-11-23T09:00:00.000Z');
const ISO = new Date(NOW).toISOString();

function makeRun(checks: CiCheck[] = []): CiRun {
  return {
    id: 'run-1',
    workflowName: 'CI',
    event: 'push',
    branch: 'main',
    commitSha: 'a'.repeat(40),
    commitMessage: 'test commit',
    author: 'tester',
    attempt: 1,
    status: 'completed',
    conclusion: 'success',
    createdAt: ISO,
    updatedAt: ISO,
    durationMs: 1_000,
    jobs: [],
    checks,
    artifacts: [],
    metrics: [],
    codeAreas: [],
  };
}

function makeCheck(conclusion: string | null): CiCheck {
  return {
    id: 'chk-1',
    name: 'Required check',
    conclusion,
    status: 'completed',
    required: true,
  };
}

function makeFlake(severity: FlakeScore['severity']): FlakeScore {
  return {
    testId: 'CI::e2e::checkout.spec',
    name: 'checkout.spec',
    samples: 6,
    passes: 3,
    failures: 3,
    flips: 5,
    recentFailures: 2,
    recoveries: 1,
    codeAreas: ['checkout'],
    score: severity === 'critical' ? 82 : 61,
    severity,
    confidence: 0.9,
    isFlaky: true,
    lastSeenAt: ISO,
    evidence: ['5 pass/fail transitions across 6 runs'],
  };
}

const allPassing = () =>
  evaluateGates(
    GATE_KINDS.map((kind) => ({ kind, status: 'pass' as const, artifacts: [] })),
    DEFAULT_GATE_POLICY,
    ISO,
  );

describe('assessReleaseReadiness', () => {
  it('blocks for required gate/check failures, active incidents, correlated regressions and critical flakes', () => {
    const observation: GateObservation = {
      kind: 'e2e',
      status: 'fail',
      artifacts: [],
      runId: 'run-1',
    };
    const correlation: Correlation = {
      id: 'reg-checkout',
      kind: 'regression',
      title: 'Checkout timeout regression',
      confidence: 0.92,
      rule: 'fingerprint',
      evidence: ['Fingerprint present in failure text'],
      signals: ['signal-1'],
    };
    const regression: RegressionRecord = {
      id: 'reg-checkout',
      fingerprint: 'checkout timeout',
      title: 'Checkout timeout regression',
      status: 'investigating',
      detectedAt: ISO,
      areas: ['checkout'],
    };
    const incident: IncidentRecord = {
      id: 'inc-1',
      title: 'Billing RPC degradation',
      severity: 'major',
      startedAt: new Date(NOW - 3_600_000).toISOString(),
      areas: ['billing'],
    };

    const report = assessReleaseReadiness({
      runs: [makeRun([makeCheck('failure')])],
      evaluation: evaluateGates([observation], DEFAULT_GATE_POLICY, ISO),
      flakes: [makeFlake('critical')],
      correlations: [correlation],
      regressions: [regression],
      incidents: [incident],
      nowMs: NOW,
    });

    expect(report.status).toBe('blocked');
    expect(report.blockers.map((item) => item.id)).toEqual([
      'check:run-1:chk-1',
      'flake:CI::e2e::checkout.spec',
      'gate:e2e',
      'incident:inc-1',
      'regression:reg-checkout',
    ]);
    expect(report.score).toBe(0);
    expect(report.checkedAt).toBe(ISO);
  });

  it('reports ready when no blocking or warning evidence remains', () => {
    const report = assessReleaseReadiness({
      runs: [makeRun([makeCheck('success')])],
      evaluation: allPassing(),
      flakes: [],
      correlations: [],
      regressions: [
        {
          id: 'reg-fixed',
          fingerprint: 'fixed',
          title: 'Fixed regression',
          status: 'fixed',
          detectedAt: ISO,
          areas: [],
        },
      ],
      incidents: [],
      nowMs: NOW,
    });

    expect(report.status).toBe('ready');
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.score).toBe(100);
  });

  it('warns for high-risk flakes and uncorrelated open regressions', () => {
    const report = assessReleaseReadiness({
      runs: [],
      evaluation: allPassing(),
      flakes: [makeFlake('high')],
      correlations: [],
      regressions: [
        {
          id: 'reg-open',
          fingerprint: 'open',
          title: 'Open regression',
          status: 'open',
          detectedAt: ISO,
          areas: ['checkout'],
        },
      ],
      incidents: [],
      nowMs: NOW,
    });

    expect(report.status).toBe('warning');
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings.map((item) => item.id)).toEqual([
      'flake:CI::e2e::checkout.spec',
      'regression:reg-open',
    ]);
    expect(report.score).toBe(100 - 2 * 6);
  });
});
