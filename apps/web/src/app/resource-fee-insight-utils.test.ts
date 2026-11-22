import { describe, expect, it } from 'vitest';
import type { FuzzingRun } from './types';
import {
  aggregateCampaignFeeInsight,
  aggregateFeeSamples,
  buildFeeTrend,
  buildHistogram,
  buildRunFeeSummary,
  countThresholdCrossings,
  extractRunFeeSample,
  filterRunsForCampaign,
  groupTopExpensiveFixtures,
  resolveCampaignThresholds,
  type RunFeeSample,
} from './resource-fee-insight-utils';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    campaignId: 'campaign-fixture',
    status: 'completed',
    area: 'budget',
    severity: 'low',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 500_000,
    memoryBytes: 2_000_000,
    minResourceFee: 1_000,
    ...overrides,
  };
}

function makeCrashingRun(id: string, contract: string, method: string, fee: number): FuzzingRun {
  return makeRun({
    id,
    status: 'failed',
    minResourceFee: fee,
    crashDetail: {
      failureCategory: 'BudgetExceeded',
      signature: `sig:${contract}`,
      payload: JSON.stringify({ contract, method }),
      replayAction: 'replay',
    },
  });
}

describe('extractRunFeeSample', () => {
  it('reads the W5-A12 camelCase envelope', () => {
    const run = makeRun({
      resourceUsage: { cpuInstructions: 123, memoryBytes: 456, minBuiltinEntries: 7 },
      fee: {
        minResourceFee: 1_500,
        inclusionFee: 200,
        rentBumps: 3,
        feeWarnThreshold: 1_200,
        expensiveSuccess: true,
      },
    });

    const sample = extractRunFeeSample(run);
    expect(sample.source).toBe('envelope');
    expect(sample.cpuInstructions).toBe(123);
    expect(sample.memoryBytes).toBe(456);
    expect(sample.minResourceFee).toBe(1_500);
    expect(sample.minBuiltinEntries).toBe(7);
    expect(sample.inclusionFee).toBe(200);
    expect(sample.rentBumps).toBe(3);
    expect(sample.feeWarnThreshold).toBe(1_200);
    expect(sample.expensiveSuccess).toBe(true);
    expect(sample.expensiveFailure).toBe(false);
  });

  it('tolerates snake_case envelope aliases emitted by the runner', () => {
    const run = {
      ...makeRun(),
      campaignId: undefined,
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
      campaign_id: 'campaign-legacy',
      cpu_instructions: 10,
      mem_bytes: 20,
      min_resource_fee: 30,
      fee_warn_threshold: 25,
    } as unknown as FuzzingRun;

    const sample = extractRunFeeSample(run);
    expect(sample.campaignId).toBe('campaign-legacy');
    expect(sample.cpuInstructions).toBe(10);
    expect(sample.memoryBytes).toBe(20);
    expect(sample.minResourceFee).toBe(30);
    expect(sample.feeWarnThreshold).toBe(25);
  });

  it('reads campaign association from a health snapshot wrapper', () => {
    const run = {
      ...makeRun({ campaignId: undefined }),
      health: { campaign_id: 'campaign-health' },
    } as unknown as FuzzingRun;

    expect(extractRunFeeSample(run).campaignId).toBe('campaign-health');
  });

  it('falls back to flat pre-W5-A12 metrics', () => {
    const sample = extractRunFeeSample(makeRun());
    expect(sample.source).toBe('legacy');
    expect(sample.hasFeeData).toBe(true);
    expect(sample.cpuInstructions).toBe(500_000);
    expect(sample.minResourceFee).toBe(1_000);
  });

  it('reports fee-data-absent when no numeric metrics exist', () => {
    const run = {
      ...makeRun(),
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
    } as unknown as FuzzingRun;

    const sample = extractRunFeeSample(run);
    expect(sample.source).toBe('absent');
    expect(sample.hasFeeData).toBe(false);
    expect(sample.cpuInstructions).toBeNull();
    expect(sample.minResourceFee).toBeNull();
  });

  it('rejects malformed values instead of plotting them', () => {
    const run = {
      ...makeRun(),
      cpuInstructions: Number.NaN,
      memoryBytes: -1,
      minResourceFee: Number.POSITIVE_INFINITY,
    } as FuzzingRun;

    const sample = extractRunFeeSample(run);
    expect(sample.cpuInstructions).toBeNull();
    expect(sample.memoryBytes).toBeNull();
    expect(sample.minResourceFee).toBeNull();
    expect(sample.hasFeeData).toBe(false);
  });

  it('derives expensive markers when the explicit flag is missing', () => {
    const expensiveSuccess = extractRunFeeSample(
      makeRun({ status: 'completed', minResourceFee: 3_500 }),
    );
    const expensiveFailure = extractRunFeeSample(
      makeRun({ status: 'failed', minResourceFee: 3_500 }),
    );
    const cheapSuccess = extractRunFeeSample(
      makeRun({ status: 'completed', minResourceFee: 100 }),
    );

    expect(expensiveSuccess.expensiveSuccess).toBe(true);
    expect(expensiveFailure.expensiveFailure).toBe(true);
    expect(cheapSuccess.expensiveSuccess).toBe(false);
  });
});

describe('buildHistogram', () => {
  it('counts values into fixed-width buckets with an inclusive final edge', () => {
    const histogram = buildHistogram([0, 5, 10, 15, 20], 'fee', {
      bucketCount: 2,
      min: 0,
      max: 20,
      warning: 10,
      critical: 20,
    });

    expect(histogram.buckets).toHaveLength(2);
    expect(histogram.buckets[0].count).toBe(2); // 0, 5
    expect(histogram.buckets[1].count).toBe(3); // 10, 15, 20
    expect(histogram.total).toBe(5);
    expect(histogram.buckets[1].end).toBe(20);
  });

  it('puts the maximum in the final bucket when the range is explicit', () => {
    const histogram = buildHistogram([0, 10, 20], 'cpu', {
      bucketCount: 2,
      min: 0,
      max: 20,
    });
    expect(histogram.buckets.map((bucket) => bucket.count)).toEqual([1, 2]);
  });

  it('computes threshold marker positions as percentages', () => {
    const histogram = buildHistogram([0, 50, 100], 'fee', {
      bucketCount: 4,
      min: 0,
      max: 100,
      warning: 25,
      critical: 80,
    });
    expect(histogram.warningMarker.position).toBe(25);
    expect(histogram.criticalMarker.position).toBe(80);
    expect(histogram.warningMarker.inRange).toBe(true);
  });

  it('returns empty buckets when there are no samples', () => {
    const histogram = buildHistogram([], 'memory', { bucketCount: 3 });
    expect(histogram.total).toBe(0);
    expect(histogram.buckets).toHaveLength(3);
    expect(histogram.buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe('threshold crossings', () => {
  it('separates warning-band and critical counts', () => {
    const crossing = countThresholdCrossings([100, 500, 900, 1_000, 1_200], 'fee', 500, 1_000);
    expect(crossing.warningCount).toBe(2); // 500, 900
    expect(crossing.criticalCount).toBe(2); // 1000, 1200
    expect(crossing.crossingCount).toBe(4);
    expect(crossing.crossingRatio).toBeCloseTo(0.8);
  });

  it('ignores malformed values', () => {
    const crossing = countThresholdCrossings(
      [Number.NaN, -1, Number.POSITIVE_INFINITY, 750],
      'cpu',
      500,
      1_000,
    );
    expect(crossing.crossingCount).toBe(1);
    expect(crossing.total).toBe(4);
  });
});

describe('fee trend', () => {
  it('buckets timestamped samples and preserves fees', () => {
    const samples = Array.from({ length: 10 }, (_, index) =>
      extractRunFeeSample(
        makeRun({
          id: `run-${index}`,
          minResourceFee: 1_000 + index * 100,
          startedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 10)).toISOString(),
        }),
      ),
    );

    const trend = buildFeeTrend(samples, { bucketMs: 30 * 60_000, maxPoints: 100 });
    expect(trend.points.length).toBeGreaterThan(0);
    expect(trend.downsampled).toBe(false);
    expect(trend.points[0].runCount).toBe(3); // minutes 0, 10, 20
    expect(trend.points[0].avgFee).toBe(1_100);
  });

  it('downsamples long campaigns to the requested point cap', () => {
    const samples: RunFeeSample[] = Array.from({ length: 1_000 }, (_, index) =>
      extractRunFeeSample(
        makeRun({
          id: `run-${index}`,
          minResourceFee: 1_000 + (index % 50) * 10,
          startedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
        }),
      ),
    );

    const trend = buildFeeTrend(samples, { bucketMs: 60_000, maxPoints: 50 });
    expect(trend.downsampled).toBe(true);
    expect(trend.points.length).toBeLessThanOrEqual(50);
  });

  it('returns an empty trend when samples have no timestamps', () => {
    const trend = buildFeeTrend([extractRunFeeSample(makeRun())]);
    expect(trend.points).toEqual([]);
    expect(trend.downsampled).toBe(false);
  });
});

describe('top expensive fixtures', () => {
  it('groups by contract call, sorts by peak fee and links the representative run', () => {
    const samples = [
      extractRunFeeSample(makeCrashingRun('run-a', 'token', 'transfer', 2_000)),
      extractRunFeeSample(makeCrashingRun('run-b', 'token', 'transfer', 4_000)),
      extractRunFeeSample(makeCrashingRun('run-c', 'vault', 'rebalance', 3_000)),
    ];

    const fixtures = groupTopExpensiveFixtures(samples, 10);
    expect(fixtures[0].fixture).toBe('token::transfer');
    expect(fixtures[0].runCount).toBe(2);
    expect(fixtures[0].maxFee).toBe(4_000);
    expect(fixtures[0].representativeRunId).toBe('run-b');
    expect(fixtures[0].href).toBe('/runs/run-b');
    expect(fixtures[1].fixture).toBe('vault::rebalance');
  });

  it('honours the top-N cap', () => {
    const samples = Array.from({ length: 8 }, (_, index) =>
      extractRunFeeSample(makeCrashingRun(`run-${index}`, `c${index}`, 'call', index * 100)),
    );
    expect(groupTopExpensiveFixtures(samples, 3)).toHaveLength(3);
  });
});

describe('campaign aggregation', () => {
  it('filters scoped runs by campaign id', () => {
    const runs = [
      makeRun({ id: 'a', campaignId: 'campaign-a', minResourceFee: 1_000 }),
      makeRun({ id: 'b', campaignId: 'campaign-b', minResourceFee: 5_000 }),
      makeRun({ id: 'c', campaignId: 'campaign-a', minResourceFee: 2_000 }),
    ];

    const insight = aggregateCampaignFeeInsight('campaign-a', runs);
    expect(insight.runCount).toBe(2);
    expect(insight.totals.totalFee).toBe(3_000);
    expect(insight.expensiveFixtures).toHaveLength(2);
  });

  it('treats legacy runs without campaign ids as the requested campaign', () => {
    const legacy = [
      { ...makeRun({ id: 'legacy-a' }), campaignId: undefined },
      { ...makeRun({ id: 'legacy-b' }), campaignId: undefined },
    ];
    const insight = aggregateCampaignFeeInsight('campaign-anything', legacy);
    expect(insight.runCount).toBe(2);
    expect(insight.coverage.legacy).toBe(2);
    expect(insight.hasFeeData).toBe(true);
  });

  it('reports coverage and absent fee data without inventing zeros', () => {
    const absent = {
      ...makeRun({ id: 'absent' }),
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
      campaignId: 'campaign-empty',
    } as unknown as FuzzingRun;

    const insight = aggregateCampaignFeeInsight('campaign-empty', [absent]);
    expect(insight.runCount).toBe(1);
    expect(insight.runsWithFeeData).toBe(0);
    expect(insight.coverage.absent).toBe(1);
    expect(insight.hasFeeData).toBe(false);
    expect(insight.totals.avgFee).toBe(0);
    expect(insight.histograms.fee.total).toBe(0);
  });

  it('aggregates threshold crossings and expensive flags', () => {
    const samples = [
      extractRunFeeSample(makeRun({ id: 'cheap', minResourceFee: 100 })),
      extractRunFeeSample(makeRun({ id: 'warn', minResourceFee: 3_500 })),
      extractRunFeeSample(makeRun({ id: 'flag', minResourceFee: 6_000 })),
    ];
    const insight = aggregateFeeSamples('campaign-fixture', samples);

    expect(insight.thresholdCrossings.fee.warningCount).toBe(1);
    expect(insight.thresholdCrossings.fee.criticalCount).toBe(1);
    expect(insight.thresholdCrossings.fee.crossingCount).toBe(2);
    expect(insight.expensiveSuccessCount).toBe(2);
  });

  it('uses the most common A12 fee warning threshold', () => {
    const samples = [
      extractRunFeeSample(makeRun({ id: 'a', feeWarnThreshold: 1_000 })),
      extractRunFeeSample(makeRun({ id: 'b', feeWarnThreshold: 1_500 })),
      extractRunFeeSample(makeRun({ id: 'c', feeWarnThreshold: 1_500 })),
    ];
    expect(resolveCampaignThresholds(samples).feeWarning).toBe(1_500);
  });

  it('filterRunsForCampaign keeps legacy rows when no run is scoped', () => {
    const legacy = [{ ...makeRun({ id: 'one' }), campaignId: undefined }];
    expect(filterRunsForCampaign(legacy, 'anything')).toHaveLength(1);
  });
});

describe('buildRunFeeSummary', () => {
  it('summarises an envelope run with flags and campaign link', () => {
    const run = makeRun({
      fee: {
        minResourceFee: 6_000,
        feeWarnThreshold: 2_500,
        expensiveFailure: true,
      },
      status: 'failed',
      cpuInstructions: 6_000_000,
      memoryBytes: 12_000_000,
    });

    const summary = buildRunFeeSummary(run);
    expect(summary.source).toBe('envelope');
    expect(summary.hasFeeData).toBe(true);
    expect(summary.expensiveFailure).toBe(true);
    expect(summary.levels.cpu).toBe('critical');
    expect(summary.levels.memory).toBe('critical');
    expect(summary.levels.fee).toBe('critical');
    expect(summary.campaignHref).toBe('/campaigns/campaign-fixture');
    expect(summary.href).toBe('/runs/run-1');
  });

  it('marks a no-data run as absent', () => {
    const run = {
      ...makeRun(),
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
    } as unknown as FuzzingRun;

    const summary = buildRunFeeSummary(run);
    expect(summary.source).toBe('absent');
    expect(summary.hasFeeData).toBe(false);
    expect(summary.levels.overall).toBe('unknown');
  });

  it('uses the run-specific fee warning threshold', () => {
    const summary = buildRunFeeSummary(
      makeRun({ feeWarnThreshold: 900, minResourceFee: 1_000 }),
    );
    expect(summary.feeWarnThreshold).toBe(900);
    expect(summary.levels.fee).toBe('warning');
  });
});
