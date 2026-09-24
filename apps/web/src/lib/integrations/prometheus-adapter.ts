import { createAbortSignal } from './adapter-utils';
import {
  type ExportConfig,
  type MetricsExportDependencies,
} from '../../app/integrate-metrics-export-to-prometheus-utils';

export interface PrometheusAdapterOptions {
  endpoint: string;
  interval?: number;
  enabled?: boolean;
  labels?: Record<string, string>;
  pushPath?: string;
  healthPath?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/** Maximum length of a label value before defensive truncation. */
export const MAX_LABEL_VALUE_LENGTH = 200;

/** Sentinel appended to truncated values so they are never mistaken for full ones. */
export const TRUNCATION_MARKER = "...[truncated]";

/** Statically allow-listed metric NAMES emitted to Prometheus. */
export const ALLOWED_METRIC_NAMES = new Set([
  "crashlab_runs_total",
  "crashlab_runs_failed_total",
  "crashlab_simulation_success_total",
  "crashlab_simulation_failure_total",
  "crashlab_execution_success_total",
  "crashlab_execution_failure_total",
]);

/** Maximum number of label pairs a single push may carry. */
export const MAX_LABELS_PER_PUSH = 10;

/** Maximum distinct series a single push may imply before it is rejected. */
export const MAX_SERIES_BUDGET = 100;

/**
 * Statically allow-listed label NAMES emitted to Prometheus. Label names may
 * only come from this fixed set; anything else is dropped with a warning so
 * arbitrary input can never influence metric identity.
 */
export const ALLOWED_LABEL_NAMES = new Set([
  "run_id",
  "run_name",
  "campaign",
  "area",
  "severity",
  "status",
  "instance",
  "job",
  "queue",
]);

/**
 * Escape a label value per the Prometheus text exposition data model:
 * backslash `\` -> `\\`, double quote `"` -> `\"`, and newline -> `\n`.
 * Unescaped backslashes/quotes/newlines would cause pushgateway to reject the
 * whole scrape batch with a 400, silencing ALL metrics, not just the offender.
 */
export function escapeLabelValue(value: string): string {
  // Order matters: backslash must be escaped first so the escape sequences we
  // insert for quote/newline are not themselves re-escaped.
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Truncate a label value to MAX_LABEL_VALUE_LENGTH characters, appending a
 * marker suffix so down-stream consumers can tell it was truncated.
 */
export function truncateLabelValue(value: string): string {
  if (value.length <= MAX_LABEL_VALUE_LENGTH) {
    return value;
  }
  const keep = MAX_LABEL_VALUE_LENGTH - TRUNCATION_MARKER.length;
  return value.slice(0, keep) + TRUNCATION_MARKER;
}

/**
 * Fully sanitize a label value: escape Prometheus metacharacters, then
 * defensively truncate well beyond typical limits.
 */
export function sanitizeLabelValue(value: string): string {
  return truncateLabelValue(escapeLabelValue(value));
}

/**
 * Validate a label NAME against the static whitelist. Returns true when the
 * name is safe to emit; otherwise warnings and skips (returns null from the
 * builder) so arbitrary labels can never produce invalid exposition.
 */
export function isAllowedLabelName(name: string): boolean {
  return ALLOWED_LABEL_NAMES.has(name);
}

/**
 * Validate a metric NAME against the static whitelist so unbounded input can
 * never mint new series identifiers and blow up cardinality.
 */
export function isAllowedMetricName(name: string): boolean {
  return ALLOWED_METRIC_NAMES.has(name);
}

/**
 * Bound a label set before emission: drop non-whitelisted names, truncate and
 * escape every value, and cap the total number of label pairs. Keeps
 * cardinality finite even when the caller passes attacker-controlled input.
 */
export function boundPushLabels(labels: Record<string, string>): Record<string, string> {
  const bounded: Record<string, string> = {};
  for (const [name, value] of Object.entries(labels)) {
    if (Object.keys(bounded).length >= MAX_LABELS_PER_PUSH) {
      break;
    }
    if (!isAllowedLabelName(name) || value.length === 0) {
      continue;
    }
    bounded[name] = sanitizeLabelValue(value);
  }
  return bounded;
}

/**
 * Approximate distinct-series cardinality implied by a label set. Series
 * multiply with every label dimension; when no labels are present exactly one
 * series is implied.
 */
export function estimateSeriesCount(labels: Record<string, string>): number {
  const count = Object.keys(labels).length;
  return count > 0 ? count : 1;
}

/**
 * Emit a single `name="value"` label pair from a whitelisted name. Returns the
 * serialized label or null when the label name is not allow-listed or the
 * value is empty.
 */
export function serializeLabel(name: string, value: string): string | null {
  if (!isAllowedLabelName(name)) {
    console.warn(`[prometheus-adapter] skipping disallowed label name "${name}"`);
    return null;
  }
  if (value.length === 0) {
    return null;
  }
  return `${name}="${sanitizeLabelValue(value)}"`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function joinUrl(base: string, path?: string): string {
  if (!path) {
    return base;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${trimTrailingSlash(base)}${path.startsWith('/') ? '' : '/'}${path}`;
}

function toExportConfig(options: PrometheusAdapterOptions): ExportConfig {
  const endpoint = trimTrailingSlash(options.endpoint);

  return {
    endpoint,
    interval: options.interval ?? 15,
    enabled: (options.enabled ?? true) && endpoint.length > 0,
    labels: options.labels ?? {},
  };
}

async function parsePushedSeries(response: Response): Promise<number> {
  try {
    const payload = (await response.json()) as { pushedSeries?: number; series?: number };
    if (typeof payload.pushedSeries === 'number') {
      return payload.pushedSeries;
    }

    if (typeof payload.series === 'number') {
      return payload.series;
    }
  } catch {
    // Fall back to the response status below.
  }

  return response.ok ? 1 : 0;
}

export function createPrometheusMetricsExportDependencies(
  options: PrometheusAdapterOptions,
): MetricsExportDependencies {
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultHeaders = options.headers ?? {};
  const signal = createAbortSignal(options.timeoutMs);

  return {
    async resolveConfig() {
      const config = toExportConfig(options);
      return config.enabled ? config : null;
    },

    async pushMetrics(config) {
      const boundedLabels = boundPushLabels(config.labels);

      // Reject pushes whose implied series exceed the cardinality budget
      // instead of letting unbounded label input multiply series on the exporter.
      if (estimateSeriesCount(boundedLabels) > MAX_SERIES_BUDGET) {
        return { accepted: false, pushedSeries: 0 };
      }

      const response = await fetchImpl(joinUrl(config.endpoint, options.pushPath), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...defaultHeaders,
        },
        signal,
        body: JSON.stringify({
          endpoint: config.endpoint,
          interval: config.interval,
          enabled: config.enabled,
          labels: boundedLabels,
        }),
      });

      return {
        accepted: response.ok,
        pushedSeries: await parsePushedSeries(response),
      };
    },

    async queryExporterHealth(endpoint) {
      const response = await fetchImpl(joinUrl(endpoint, options.healthPath), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...defaultHeaders,
        },
        signal,
      });

      return {
        healthy: response.ok,
        statusCode: response.status,
      };
    },
  };
}