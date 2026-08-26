import type { FuzzingRun } from '../../types';
import type { ChartConfig, MetricKey, DimensionKey, ChartFilter } from './chart-builder-dsl';

export interface ChartDataPoint {
  label: string;
  [key: string]: string | number;
}

const METRIC_ACCESSORS: Record<MetricKey, (run: FuzzingRun) => number> = {
  duration: (r) => r.duration,
  cpuInstructions: (r) => r.cpuInstructions,
  memoryBytes: (r) => r.memoryBytes,
  minResourceFee: (r) => r.minResourceFee,
  seedCount: (r) => r.seedCount,
};

const METRIC_LABELS: Record<MetricKey, string> = {
  duration: 'Duration (ms)',
  cpuInstructions: 'CPU Instructions',
  memoryBytes: 'Memory (bytes)',
  minResourceFee: 'Min Resource Fee',
  seedCount: 'Seed Count',
};

const DIMENSION_ACCESSORS: Record<DimensionKey, (run: FuzzingRun) => string> = {
  status: (r) => r.status,
  area: (r) => r.area,
  severity: (r) => r.severity,
  day: (r) => (r.queuedAt ?? r.startedAt ?? '').slice(0, 10),
};

const FILTER_OPS: Record<ChartFilter['op'], (val: unknown, target: string | number) => boolean> = {
  eq: (val, target) => String(val) === String(target),
  neq: (val, target) => String(val) !== String(target),
  gt: (val, target) => Number(val) > Number(target),
  lt: (val, target) => Number(val) < Number(target),
  gte: (val, target) => Number(val) >= Number(target),
  lte: (val, target) => Number(val) <= Number(target),
  in: (val, target) => {
    if (Array.isArray(target)) return target.map(String).includes(String(val));
    return String(val) === String(target);
  },
};

const ROW_CAP = 5000;

export function applyFilters(runs: FuzzingRun[], filters?: ChartFilter[]): FuzzingRun[] {
  if (!filters || filters.length === 0) return runs;
  return runs.filter((run) =>
    filters.every((filter) => {
      const fieldValue = (run as Record<string, unknown>)[filter.field];
      if (fieldValue === undefined) return false;
      return FILTER_OPS[filter.op](fieldValue, filter.value as string | number);
    }),
  );
}

export function compileChartConfig(
  config: ChartConfig,
  runs: FuzzingRun[],
): { data: ChartDataPoint[]; metricLabels: Record<string, string>; rowCapHit: boolean } {
  const filtered = applyFilters(runs, config.filters).slice(0, ROW_CAP);
  const rowCapHit = runs.length > ROW_CAP;

  if (config.dimension) {
    return compileWithDimension(filtered, config, rowCapHit);
  }
  return compileAggregated(filtered, config, rowCapHit);
}

function compileAggregated(
  runs: FuzzingRun[],
  config: ChartConfig,
  rowCapHit: boolean,
): { data: ChartDataPoint[]; metricLabels: Record<string, string>; rowCapHit: boolean } {
  const metricLabels: Record<string, string> = {};
  config.metrics.forEach((m) => { metricLabels[m] = METRIC_LABELS[m]; });

  if (config.type === 'scatter') {
    const data = runs.map((run) => {
      const point: ChartDataPoint = { label: run.id };
      config.metrics.forEach((m) => {
        point[m] = METRIC_ACCESSORS[m](run);
      });
      if (config.metrics.length >= 2) {
        point['x'] = METRIC_ACCESSORS[config.metrics[0]](run);
        point['y'] = METRIC_ACCESSORS[config.metrics[1]](run);
      }
      return point;
    });
    return { data, metricLabels, rowCapHit };
  }

  const aggregated: ChartDataPoint = { label: 'All Runs' };
  config.metrics.forEach((m) => {
    const accessor = METRIC_ACCESSORS[m];
    const values = runs.map(accessor);
    if (config.type === 'bar') {
      aggregated[m] = values.reduce((a, b) => a + b, 0) / values.length;
    } else {
      aggregated[m] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  });
  return { data: [aggregated], metricLabels, rowCapHit };
}

function compileWithDimension(
  runs: FuzzingRun[],
  config: ChartConfig,
  rowCapHit: boolean,
): { data: ChartDataPoint[]; metricLabels: Record<string, string>; rowCapHit: boolean } {
  const dimAccessor = DIMENSION_ACCESSORS[config.dimension!];
  const metricLabels: Record<string, string> = {};
  config.metrics.forEach((m) => { metricLabels[m] = METRIC_LABELS[m]; });

  const groups = new Map<string, FuzzingRun[]>();
  for (const run of runs) {
    const key = dimAccessor(run);
    const existing = groups.get(key) ?? [];
    existing.push(run);
    groups.set(key, existing);
  }

  const data: ChartDataPoint[] = [];
  for (const [groupKey, groupRuns] of groups) {
    const point: ChartDataPoint = { label: groupKey };
    config.metrics.forEach((m) => {
      const accessor = METRIC_ACCESSORS[m];
      const values = groupRuns.map(accessor);
      point[m] = values.reduce((a, b) => a + b, 0) / values.length;
    });
    data.push(point);
  }

  if (config.type === 'line' || config.type === 'bar') {
    data.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  return { data, metricLabels, rowCapHit };
}

export function downsampleHint(runs: FuzzingRun[]): string | null {
  if (runs.length > ROW_CAP) {
    return `Dataset contains ${runs.length.toLocaleString()} rows. Showing first ${ROW_CAP.toLocaleString()} after filtering. Consider narrowing filters.`;
  }
  return null;
}
