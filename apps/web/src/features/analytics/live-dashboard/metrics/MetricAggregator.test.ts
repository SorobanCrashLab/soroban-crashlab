/** Metric aggregation tests (#2206). */
import { describe, expect, it } from 'vitest';
import { MetricAggregator, snapshotMetrics } from './MetricAggregator';

describe('MetricAggregator', () => {
  it('summarizes samples with a virtual clock', () => {
    const aggregator = new MetricAggregator(10_000, () => 0);
    aggregator.push(10, 0);
    aggregator.push(20, 1000);
    aggregator.push(30, 2000);
    const summary = aggregator.summary(2000);
    expect(summary).toMatchObject({ count: 3, current: 30, average: 20, min: 10, max: 30 });
    expect(summary.ratePerSecond).toBeCloseTo(1.5);
  });

  it('prunes samples outside the rolling window', () => {
    const aggregator = new MetricAggregator(1000, () => 0);
    aggregator.push(1, 0);
    aggregator.push(2, 2000);
    expect(aggregator.summary(2000).count).toBe(1);
  });

  it('handles empty streams and ignores non-finite samples', () => {
    const aggregator = new MetricAggregator(1000, () => 0);
    expect(aggregator.summary(0).count).toBe(0);
    aggregator.push(Number.NaN, 0);
    expect(aggregator.summary(0).count).toBe(0);
  });

  it('builds a flat snapshot from named streams', () => {
    const runs = new MetricAggregator(1000, () => 0);
    runs.push(5, 0);
    const snapshot = snapshotMetrics({ runs }, 0);
    expect(snapshot.runs.current).toBe(5);
  });
});
