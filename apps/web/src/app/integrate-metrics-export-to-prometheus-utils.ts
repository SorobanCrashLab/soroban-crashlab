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
