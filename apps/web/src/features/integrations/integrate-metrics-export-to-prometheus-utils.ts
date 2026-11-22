/**
 * Integrate Metrics export to Prometheus
 *
 * Pure utility functions extracted from MetricsExportToPrometheus.
 * Free of React/browser dependencies for deterministic unit testing.
 */

export interface MetricPoint {
  time: string;
  value: number;
}

export interface ExportConfig {
  endpoint: string;
  interval: number;
  enabled: boolean;
  labels: Record<string, string>;
}

export interface ExportConfigValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates the Prometheus ExportConfig */
export function validateExportConfig(config: ExportConfig): ExportConfigValidation {
  const errors: string[] = [];

  if (!config.endpoint) {
    errors.push('Endpoint is required');
  } else if (!config.endpoint.startsWith('http://') && !config.endpoint.startsWith('https://')) {
    errors.push('Endpoint must start with http:// or https://');
  }

  if (config.interval <= 0) {
    errors.push('Interval must be greater than 0');
  }

  return { isValid: errors.length === 0, errors };
}

/** Generates the Prometheus scrape config string for a given config */
export function buildPrometheusScrapeConfig(config: ExportConfig): string {
  const target = config.endpoint.replace(/^https?:\/\//, '').split('/')[0] || '';
  
  return `scrape_configs:
  - job_name: 'crashlab_exporter'
    scrape_interval: ${config.interval}s
    static_configs:
      - targets: ['${target}']`;
}

/** Generates initial mock data for the sparkline */
export function generateInitialData(points: number): MetricPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}:00`,
    value: Math.floor(Math.random() * 40) + 10
  }));
}

/** Analyzes the trend of metrics data */
export function analyzeTrend(data: MetricPoint[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';
  
  const current = data[data.length - 1].value;
  const previous = data[data.length - 2].value;
  
  if (current > previous + 5) return 'up';
  if (current < previous - 5) return 'down';
  return 'stable';
}

export interface MetricsIntegrationStep {
  id: string;
  name: string;
  status: 'passed' | 'failed';
  error?: string;
}

/**
 * External dependencies contract for Prometheus integration checks.
 *
 * Required behavior:
 * - `resolveConfig` must return null when exporter config is unavailable.
 * - `pushMetrics` must fail fast for transport or auth errors.
 * - `queryExporterHealth` must reflect exporter readiness and status code.
 */
export interface MetricsExportDependencies {
  resolveConfig(): Promise<ExportConfig | null>;
  pushMetrics(config: ExportConfig): Promise<{ accepted: boolean; pushedSeries: number }>;
  queryExporterHealth(endpoint: string): Promise<{ healthy: boolean; statusCode: number }>;
}

function pass(id: string, name: string): MetricsIntegrationStep {
  return { id, name, status: 'passed' };
}

function fail(id: string, name: string, error: string): MetricsIntegrationStep {
  return { id, name, status: 'failed', error };
}

export interface MetricsExportIntegrationResult {
  success: boolean;
  steps: MetricsIntegrationStep[];
  pushedSeries?: number;
}

/**
 * Deterministic integration boundary verification for Prometheus metrics export.
 * Provides explicit step-level pass/fail output so drift is observable in CI.
 */
export async function runMetricsExportIntegrationFlow(
  deps: MetricsExportDependencies,
): Promise<MetricsExportIntegrationResult> {
  const steps: MetricsIntegrationStep[] = [];

  const config = await deps.resolveConfig();
  if (!config) {
    steps.push(fail('config-resolve', 'Resolve exporter configuration', 'Exporter configuration not found'));
    return { success: false, steps };
  }
  steps.push(pass('config-resolve', 'Resolve exporter configuration'));

  const validation = validateExportConfig(config);
  if (!validation.isValid) {
    steps.push(
      fail(
        'config-validate',
        'Validate exporter configuration',
        validation.errors[0] ?? 'Exporter configuration invalid',
      ),
    );
    return { success: false, steps };
  }
  steps.push(pass('config-validate', 'Validate exporter configuration'));

  const push = await deps.pushMetrics(config);
  if (!push.accepted || push.pushedSeries <= 0) {
    steps.push(
      fail(
        'metrics-push',
        'Push metrics to exporter endpoint',
        'Metrics push was rejected by exporter',
      ),
    );
    return { success: false, steps };
  }
  steps.push(pass('metrics-push', 'Push metrics to exporter endpoint'));

  const health = await deps.queryExporterHealth(config.endpoint);
  if (!health.healthy || health.statusCode >= 400) {
    steps.push(
      fail(
        'health-query',
        'Verify exporter health endpoint',
        `Exporter health check returned status ${health.statusCode}`,
      ),
    );
    return { success: false, steps, pushedSeries: push.pushedSeries };
  }
  steps.push(pass('health-query', 'Verify exporter health endpoint'));

  return {
    success: true,
    steps,
    pushedSeries: push.pushedSeries,
  };
}
