import { z } from 'zod';

export const chartTypeSchema = z.enum(['line', 'bar', 'scatter', 'pie']);
export type ChartType = z.infer<typeof chartTypeSchema>;

export const datasetSchema = z.enum(['runs', 'aggregations']);
export type Dataset = z.infer<typeof datasetSchema>;

export const metricKeySchema = z.enum([
  'duration',
  'cpuInstructions',
  'memoryBytes',
  'minResourceFee',
  'seedCount',
]);
export type MetricKey = z.infer<typeof metricKeySchema>;

export const dimensionKeySchema = z.enum([
  'status',
  'area',
  'severity',
  'day',
]);
export type DimensionKey = z.infer<typeof dimensionKeySchema>;

export const filterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});
export type ChartFilter = z.infer<typeof filterSchema>;

export const chartConfigSchema = z.object({
  id: z.string().optional(),
  dataset: datasetSchema,
  metrics: z.array(metricKeySchema).min(1).max(4),
  dimension: dimensionKeySchema.optional(),
  filters: z.array(filterSchema).optional(),
  type: chartTypeSchema,
  title: z.string().min(1).max(120).optional(),
});
export type ChartConfig = z.infer<typeof chartConfigSchema>;

export type ChartValidationError = {
  path: string[];
  message: string;
};

const PIE_MAX_METRICS = 1;
const PIE_NO_DIMENSION_MSG = 'Pie charts cannot use dimension grouping — they show part-to-whole for a single metric.';

export function validateChartConfig(raw: unknown): { ok: true; config: ChartConfig } | { ok: false; errors: ChartValidationError[] } {
  const result = chartConfigSchema.safeParse(raw);
  if (result.success) {
    const config = result.data;
    const extraErrors: ChartValidationError[] = [];

    if (config.type === 'pie' && config.metrics.length > PIE_MAX_METRICS) {
      extraErrors.push({
        path: ['metrics'],
        message: `Pie charts support exactly 1 metric (got ${config.metrics.length}).`,
      });
    }

    if (config.type === 'pie' && config.dimension) {
      extraErrors.push({
        path: ['dimension'],
        message: PIE_NO_DIMENSION_MSG,
      });
    }

    if (extraErrors.length > 0) {
      return { ok: false, errors: extraErrors };
    }

    return { ok: true, config };
  }

  const errors: ChartValidationError[] = result.error.issues.map((issue) => ({
    // Zod indexes array elements numerically; the error shape is string-only.
    path: issue.path.map(String),
    message: issue.message,
  }));
  return { ok: false, errors };
}

export const CUSTOM_CHART_STORAGE_KEY = 'crashlab-custom-charts';

export interface SavedCustomChart extends ChartConfig {
  id: string;
  createdAt: string;
}

export function loadCustomCharts(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): SavedCustomChart[] {
  try {
    const raw = storage.getItem(CUSTOM_CHART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomChart(
  config: ChartConfig,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): SavedCustomChart {
  const charts = loadCustomCharts(storage);
  const entry: SavedCustomChart = {
    ...config,
    id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  charts.push(entry);
  storage.setItem(CUSTOM_CHART_STORAGE_KEY, JSON.stringify(charts));
  return entry;
}

export function deleteCustomChart(
  chartId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): void {
  const charts = loadCustomCharts(storage).filter((c) => c.id !== chartId);
  storage.setItem(CUSTOM_CHART_STORAGE_KEY, JSON.stringify(charts));
}
