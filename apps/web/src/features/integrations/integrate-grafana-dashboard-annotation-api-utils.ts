/**
 * Issue #1095 – [integration] Add Grafana dashboard annotation API integration
 *
 * Pure utility functions extracted from IntegrateGrafanaDashboardAnnotationApi.
 * Free of React/browser dependencies for deterministic unit testing.
 */

export interface GrafanaConfig {
  /** Base URL of the Grafana instance, e.g. https://grafana.example.com */
  baseUrl: string;
  /** Grafana service account / API token used to authenticate annotation requests. */
  apiToken: string;
  /** Optional dashboard UID to scope annotations to a single dashboard. */
  dashboardUid?: string;
  /** Tags applied to every annotation created by SorobanCrashLab. */
  defaultTags: string[];
  /** Whether Grafana annotation posting is currently enabled. */
  enabled: boolean;
}

export interface GrafanaConfigValidation {
  isValid: boolean;
  errors: string[];
}

export type GrafanaAnnotationStatus = 'pending' | 'sent' | 'failed';

export interface GrafanaAnnotation {
  id: string;
  runId: string;
  text: string;
  tags: string[];
  time: string;
  timeEnd?: string;
  status: GrafanaAnnotationStatus;
  grafanaAnnotationId?: number;
}

export interface AnnotationSummary {
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validates a Grafana configuration object. */
export function validateGrafanaConfig(config: GrafanaConfig): GrafanaConfigValidation {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('Grafana base URL is required');
  } else if (!config.baseUrl.startsWith('http://') && !config.baseUrl.startsWith('https://')) {
    errors.push('Grafana base URL must start with http:// or https://');
  }

  if (!config.apiToken || config.apiToken.trim().length === 0) {
    errors.push('API token is required');
  } else if (config.apiToken.trim().length < 10) {
    errors.push('API token appears invalid – it should be at least 10 characters');
  }

  if (!Array.isArray(config.defaultTags)) {
    errors.push('defaultTags must be an array of strings');
  }

  return { isValid: errors.length === 0, errors };
}

/** Returns true when the API token passes the basic format check. */
export function isApiTokenReachable(apiToken: string): boolean {
  return apiToken.trim().length >= 10;
}

// ---------------------------------------------------------------------------
// Annotation helpers
// ---------------------------------------------------------------------------

/** Strips a trailing slash from a URL. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Builds the Grafana Annotations API request payload for a fuzzing run event. */
export function buildAnnotationPayload(params: {
  runId: string;
  text: string;
  tags?: string[];
  dashboardUid?: string;
  timeMs: number;
  timeEndMs?: number;
}): Record<string, unknown> {
  const tags = Array.from(new Set(['soroban-crashlab', ...(params.tags ?? []), params.runId]));

  const payload: Record<string, unknown> = {
    time: params.timeMs,
    tags,
    text: params.text,
  };

  if (params.timeEndMs !== undefined) {
    payload.timeEnd = params.timeEndMs;
  }

  if (params.dashboardUid) {
    payload.dashboardUID = params.dashboardUid;
  }

  return payload;
}

/** Joins a Grafana base URL with a path, respecting absolute URLs. */
export function joinGrafanaUrl(baseUrl: string, path: string): string {
  const base = trimTrailingSlash(baseUrl);
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Aggregates annotation status counts. */
export function summariseAnnotations(annotations: GrafanaAnnotation[]): AnnotationSummary {
  return annotations.reduce<AnnotationSummary>(
    (acc, a) => ({
      total: acc.total + 1,
      sent: acc.sent + (a.status === 'sent' ? 1 : 0),
      pending: acc.pending + (a.status === 'pending' ? 1 : 0),
      failed: acc.failed + (a.status === 'failed' ? 1 : 0),
    }),
    { total: 0, sent: 0, pending: 0, failed: 0 },
  );
}

/** Formats an ISO timestamp for display. Returns the original string if invalid. */
export function formatAnnotationTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Maps a Grafana annotation status to a human-readable badge label. */
export function annotationStatusLabel(status: GrafanaAnnotationStatus): string {
  const labels: Record<GrafanaAnnotationStatus, string> = {
    pending: 'Pending',
    sent: 'Sent',
    failed: 'Failed',
  };
  return labels[status] ?? status;
}

/** Returns a CSS colour token name appropriate for the given status. */
export function annotationStatusColour(status: GrafanaAnnotationStatus): string {
  const colours: Record<GrafanaAnnotationStatus, string> = {
    pending: 'yellow',
    sent: 'green',
    failed: 'red',
  };
  return colours[status] ?? 'zinc';
}

// ---------------------------------------------------------------------------
// Deterministic integration boundary flow
// ---------------------------------------------------------------------------

export interface GrafanaIntegrationStep {
  id: string;
  name: string;
  status: 'passed' | 'failed';
  error?: string;
}

/**
 * External dependencies contract for Grafana annotation integration checks.
 *
 * Required behavior:
 * - `resolveConfig` must return null when annotation config is unavailable.
 * - `queryHealth` must reflect Grafana instance reachability and status code.
 * - `createAnnotation` must fail fast for transport or auth errors.
 */
export interface GrafanaAnnotationDependencies {
  resolveConfig(): Promise<GrafanaConfig | null>;
  queryHealth(baseUrl: string): Promise<{ healthy: boolean; statusCode: number }>;
  createAnnotation(
    config: GrafanaConfig,
    annotation: { runId: string; text: string; timeMs: number },
  ): Promise<{ accepted: boolean; annotationId?: number }>;
}

export interface GrafanaIntegrationResult {
  success: boolean;
  steps: GrafanaIntegrationStep[];
  annotationId?: number;
}

function pass(id: string, name: string): GrafanaIntegrationStep {
  return { id, name, status: 'passed' };
}

function fail(id: string, name: string, error: string): GrafanaIntegrationStep {
  return { id, name, status: 'failed', error };
}

/**
 * Deterministic integration boundary verification for Grafana annotation posting.
 * Provides explicit step-level pass/fail output so drift is observable in CI.
 */
export async function runGrafanaAnnotationIntegrationFlow(
  deps: GrafanaAnnotationDependencies,
): Promise<GrafanaIntegrationResult> {
  const steps: GrafanaIntegrationStep[] = [];

  const config = await deps.resolveConfig();
  if (!config) {
    steps.push(fail('config-resolve', 'Resolve Grafana configuration', 'Grafana configuration not found'));
    return { success: false, steps };
  }
  steps.push(pass('config-resolve', 'Resolve Grafana configuration'));

  const validation = validateGrafanaConfig(config);
  if (!validation.isValid) {
    steps.push(
      fail('config-validate', 'Validate Grafana configuration', validation.errors[0] ?? 'Grafana configuration invalid'),
    );
    return { success: false, steps };
  }
  steps.push(pass('config-validate', 'Validate Grafana configuration'));

  const health = await deps.queryHealth(config.baseUrl);
  if (!health.healthy || health.statusCode >= 400) {
    steps.push(
      fail('health-query', 'Verify Grafana instance health', `Grafana health check returned status ${health.statusCode}`),
    );
    return { success: false, steps };
  }
  steps.push(pass('health-query', 'Verify Grafana instance health'));

  const annotation = await deps.createAnnotation(config, {
    runId: 'integration-check',
    text: '[Check] SorobanCrashLab Grafana annotation integration check',
    timeMs: Date.now(),
  });
  if (!annotation.accepted) {
    steps.push(fail('annotation-create', 'Create test annotation', 'Annotation creation was rejected by Grafana'));
    return { success: false, steps };
  }
  steps.push(pass('annotation-create', 'Create test annotation'));

  return { success: true, steps, annotationId: annotation.annotationId };
}
