import { describe, it, expect } from 'vitest';
import {
  NORMALIZATION_RULES_VERSION,
  TAXONOMY_VERSION,
  buildHierarchicalClustersFromRuns,
  clusterObservations,
  defaultNormalizationRules,
  findClusterForRun,
  normalizeSignaturePreimage,
  type FailureObservation,
  type NormalizationRules,
} from './failure-clustering';
import type { FuzzingRun } from '@/app/types';

function addr(seed: string): string {
  return `0x${seed.padEnd(40, '0')}`;
}

function obs(partial: Partial<FailureObservation> & { rawSignature: string }): FailureObservation {
  return {
    taxonomyClass: 'auth',
    seedId: 0,
    seedPayloadLen: 16,
    observedAt: 0,
    ...partial,
  };
}

describe('normalizeSignaturePreimage', () => {
  const rules = defaultNormalizationRules();

  it('records the rule-set version', () => {
    expect(normalizeSignaturePreimage('anything', rules).rulesVersion).toBe(
      NORMALIZATION_RULES_VERSION,
    );
    expect(rules.taxonomyVersion).toBe(TAXONOMY_VERSION);
  });

  it('masks addresses with first-appearance ordinals', () => {
    const normalized = normalizeSignaturePreimage(
      `transfer from=${addr('aaaa')} to=${addr('bbbb')}`,
      rules,
    );
    expect(normalized.text).toBe('transfer from=Address@0 to=Address@1');
  });

  it('collapses distinct address values into the same shape', () => {
    const a = normalizeSignaturePreimage(`call from=${addr('1111')}`, rules);
    const b = normalizeSignaturePreimage(`call from=${addr('2222')}`, rules);
    expect(a.text).toBe(b.text);
  });

  it('masks typed amounts into magnitude buckets', () => {
    expect(normalizeSignaturePreimage('debit i128:1000000000000000000', rules).text).toBe(
      'debit i128:1e18-magnitude-bucket',
    );
  });

  it('collapses amounts in the same magnitude', () => {
    const a = normalizeSignaturePreimage('debit i128:5000000', rules);
    const b = normalizeSignaturePreimage('debit i128:8000000', rules);
    expect(a.text).toBe(b.text);
    expect(a.text).toBe('debit i128:1e6-magnitude-bucket');
  });

  it('leaves small integers intact by default', () => {
    expect(normalizeSignaturePreimage('error code 404', rules).text).toBe('error code 404');
  });

  it('leaves everything intact when masking is disabled', () => {
    const raw = `call from=${addr('aaaa')} amount=i128:1000000`;
    const disabled: NormalizationRules = {
      ...defaultNormalizationRules(),
      maskAddresses: false,
      maskAmounts: false,
      maskHashes: false,
    };
    expect(normalizeSignaturePreimage(raw, disabled).text).toBe(raw);
  });
});

describe('clusterObservations', () => {
  it('merges address variants of the same bug into one cluster', () => {
    const observations: FailureObservation[] = Array.from({ length: 64 }, (_, i) =>
      obs({
        taxonomyClass: 'auth',
        rawSignature: `sig:token:transfer:from=${addr(i.toString(16))}:to=${addr(
          (i + 1).toString(16),
        )}`,
        seedId: i,
        observedAt: 1000 + i,
      }),
    );

    const clusters = clusterObservations(observations);
    expect(clusters).toHaveLength(1);
    const cluster = clusters[0]!;
    expect(cluster.count).toBe(64);
    expect(cluster.exemplarSeedId).toBe(0);
    expect(cluster.firstSeen).toBe(1000);
    expect(cluster.lastSeen).toBe(1063);
  });

  it('never merges distinct bugs (golden separation set)', () => {
    const clusters = clusterObservations([
      obs({
        rawSignature: `sig:token:transfer:from=${addr('aaaa')}:to=${addr('bbbb')}`,
        seedId: 1,
      }),
      obs({
        rawSignature: `sig:token:transfer:from=${addr('cccc')}:to=${addr('dddd')}`,
        seedId: 2,
      }),
      obs({ rawSignature: 'sig:token:transfer:amount=i128:1000000', seedId: 3 }),
      obs({ rawSignature: 'sig:token:transfer:amount=i128:9999999', seedId: 4 }),
      obs({
        rawSignature: 'sig:vault:rebalance:unwrap_budget_snapshot',
        taxonomyClass: 'state',
        seedId: 5,
      }),
    ]);

    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.count).sort()).toEqual([1, 2, 2]);
  });

  it('picks the smallest seed as exemplar', () => {
    const cluster = clusterObservations([
      obs({ rawSignature: 'sig:x:y', seedId: 7, seedPayloadLen: 100, observedAt: 1 }),
      obs({ rawSignature: 'sig:x:y', seedId: 9, seedPayloadLen: 20, observedAt: 2 }),
      obs({ rawSignature: 'sig:x:y', seedId: 3, seedPayloadLen: 50, observedAt: 3 }),
    ])[0]!;
    expect(cluster.exemplarSeedId).toBe(9);
    expect(cluster.exemplarPayloadLen).toBe(20);
  });

  it('orders clusters by descending count', () => {
    const observations: FailureObservation[] = [];
    for (let i = 0; i < 5; i += 1) observations.push(obs({ rawSignature: 'sig:a', seedId: i }));
    for (let i = 0; i < 2; i += 1)
      observations.push(obs({ rawSignature: 'sig:b', taxonomyClass: 'state', seedId: 100 + i }));
    const clusters = clusterObservations(observations);
    expect(clusters[0]!.count).toBe(5);
    expect(clusters[1]!.count).toBe(2);
  });

  it('scales to 100k signatures within a bounded time', () => {
    const TOTAL = 100_000;
    const TEMPLATES = 20;
    const observations: FailureObservation[] = Array.from({ length: TOTAL }, (_, i) => {
      const template = i % TEMPLATES;
      return obs({
        taxonomyClass: ['auth', 'state', 'budget', 'xdr'][template % 4]!,
        rawSignature: `sig:bug${template}:call:addr=0x${i
          .toString(16)
          .padStart(40, '0')}:amount=i128:${1_000_000 + (i % 1000)}`,
        seedId: i,
        observedAt: i,
      });
    });

    const start = Date.now();
    const clusters = clusterObservations(observations);
    const elapsedMs = Date.now() - start;

    expect(clusters).toHaveLength(TEMPLATES);
    expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(TOTAL);
    expect(elapsedMs).toBeLessThan(20_000);
  });
});

describe('buildHierarchicalClustersFromRuns', () => {
  const runs: FuzzingRun[] = [
    {
      id: 'run-2000',
      status: 'failed',
      area: 'auth',
      severity: 'high',
      duration: 1,
      seedCount: 30,
      cpuInstructions: 1,
      memoryBytes: 1,
      minResourceFee: 1,
      crashDetail: {
        failureCategory: 'InvariantViolation',
        signature: 'sig:token:transfer:assert_balance_nonnegative',
        payload: '{}',
        replayAction: 'replay',
      },
    },
    {
      id: 'run-2001',
      status: 'failed',
      area: 'auth',
      severity: 'high',
      duration: 1,
      seedCount: 10,
      cpuInstructions: 1,
      memoryBytes: 1,
      minResourceFee: 1,
      crashDetail: {
        failureCategory: 'InvariantViolation',
        signature: 'sig:token:transfer:assert_balance_nonnegative',
        payload: '{}',
        replayAction: 'replay',
      },
    },
    {
      id: 'run-2002',
      status: 'completed',
      area: 'state',
      severity: 'low',
      duration: 1,
      seedCount: 5,
      cpuInstructions: 1,
      memoryBytes: 1,
      minResourceFee: 1,
      crashDetail: null,
    },
  ];

  it('ignores non-failed runs and clusters the rest', () => {
    const clusters = buildHierarchicalClustersFromRuns(runs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(2);
    expect(clusters[0]!.exemplarRunId).toBe('run-2001');
  });

  it('finds the cluster for a run and exposes drill-down members', () => {
    const cluster = findClusterForRun(runs, 'run-2000');
    expect(cluster).not.toBeNull();
    expect(cluster!.members.map((m) => m.runId).sort()).toEqual(['run-2000', 'run-2001']);
    expect(findClusterForRun(runs, 'run-2002')).toBeNull();
  });
});
