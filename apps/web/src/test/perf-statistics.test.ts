import { describe, expect, it } from 'vitest';
import {
  compareBenchmarkSamples,
  confidenceInterval,
  formatBenchmarkPrComment,
  mannWhitneyU,
  welchTTest,
} from '../../scripts/perf-harness-lib.mjs';

describe('statistical benchmark comparison', () => {
  it('returns a confidence interval and Welch result', () => {
    const interval = confidenceInterval([100, 102, 101, 103]);
    expect(interval?.mean).toBe(101.5);
    expect(interval?.low).toBeLessThan(interval?.mean as number);
    const result = welchTTest([100, 101, 100, 99], [130, 132, 131, 129]);
    expect(result.deltaPct).toBeGreaterThan(20);
  });

  it('supports Mann-Whitney comparison', () => {
    const result = mannWhitneyU([1, 2, 3], [20, 21, 22]);
    expect(result.test).toBe('mann-whitney');
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('formats actionable PR comments and detects toleranced regressions', () => {
    const result = compareBenchmarkSamples([100, 100, 100], [125, 126, 124], { tolerancePct: 20 });
    expect(result.isRegression).toBe(true);
    expect(formatBenchmarkPrComment([{ metric: 'gas', ...result }])).toContain('Performance regressions detected');
  });
});
