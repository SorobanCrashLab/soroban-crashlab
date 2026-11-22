/** Rolling-window metric aggregation for the live campaign dashboard (#2206). */

export interface MetricSample {
  at: number;
  value: number;
}

export interface MetricSummary {
  count: number;
  current: number;
  average: number;
  min: number;
  max: number;
  ratePerSecond: number;
}

/** Bounded rolling-window aggregator. Old samples are pruned on every push. */
export class MetricAggregator {
  private samples: MetricSample[] = [];

  constructor(
    readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  push(value: number, at = this.now()): void {
    if (!Number.isFinite(value)) return;
    this.samples.push({ at, value });
    this.prune(at);
  }

  private prune(at: number): void {
    const cutoff = at - this.windowMs;
    this.samples = this.samples.filter((sample) => sample.at >= cutoff);
  }

  summary(at = this.now()): MetricSummary {
    this.prune(at);
    const values = this.samples.map((s) => s.value);
    if (values.length === 0) {
      return { count: 0, current: 0, average: 0, min: 0, max: 0, ratePerSecond: 0 };
    }
    const spanMs = Math.max(1, at - this.samples[0].at);
    return {
      count: values.length,
      current: values[values.length - 1],
      average: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      ratePerSecond: (values.length / spanMs) * 1000,
    };
  }
}

/** Aggregate a set of named metric streams into a flat snapshot. */
export function snapshotMetrics(
  metrics: Record<string, MetricAggregator>,
  at?: number,
): Record<string, MetricSummary> {
  return Object.fromEntries(
    Object.entries(metrics).map(([name, aggregator]) => [name, aggregator.summary(at)]),
  );
}
