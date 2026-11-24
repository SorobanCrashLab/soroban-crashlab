/*
 * normalize.ts — #2297
 * Ingest normalized profiling metrics from traces/run summaries/artifacts,
 * with metric schema versioning.
 */

export const PROFILE_METRIC_SCHEMA_VERSION = 1;

export interface NormalizedMetric {
  spanId: string;
  name: string;
  value: number;
  unit: string;
}

export function normalizeMetrics(raw: unknown): NormalizedMetric[] {
  const metrics = (raw as { metrics?: NormalizedMetric[] } | null)?.metrics ?? [];
  return metrics;
}
