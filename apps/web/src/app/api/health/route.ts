import { successResponse } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { getDatabase } from '@/lib/database/db-init';
import { createPrometheusMetricsExportDependencies } from '@/lib/integrations/prometheus-adapter';
import { getStoredSmtpConfig } from '@/lib/integrations/smtp-store';
import {
  API_FETCH_TIMEOUT_MS,
  PROMETHEUS_FETCH_TIMEOUT_MS,
} from '@/lib/timeouts';

export type DependencyStatus =
  | 'ok'
  | 'degraded'
  | 'unavailable'
  | 'not_configured';

export interface DependencyCheckResult {
  status: DependencyStatus;
  latencyMs: number;
  message?: string;
  detail?: Record<string, unknown>;
}

export type OverallHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckReport {
  status: OverallHealthStatus;
  timestamp: string;
  uptimeSec: number;
  version: string;
  dependencies: Record<string, DependencyCheckResult>;
}

/**
 * Test seam: every external touch-point (database, Prometheus, backend probe,
 * stored config, env, clock) is injected so the endpoint can be exercised
 * deterministically in unit tests.
 */
export interface HealthCheckDependencies {
  getDatabase: () => {
    getConfig: () => { type: string };
    isInitialized: () => boolean;
    initialize: () => Promise<void>;
  };
  createPrometheusAdapter: typeof createPrometheusMetricsExportDependencies;
  getStoredSmtpConfig: () => { host: string } | null;
  prometheusEndpoint: string;
  prometheusHealthPath: string;
  prometheusTimeoutMs: number;
  backendUrl: string | undefined;
  backendTimeoutMs: number;
  fetchImpl: typeof fetch;
  env: NodeJS.ProcessEnv;
  startTimeMs: number;
  now: () => Date;
}

export const HEALTH_CHECK_VERSION = '1.0.0';

const DEFAULT_PROMETHEUS_ENDPOINT = 'http://localhost:9090';
const DEFAULT_PROMETHEUS_HEALTH_PATH = '/-/healthy';

function isEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function timedCheck(
  fn: () => Promise<Omit<DependencyCheckResult, 'latencyMs'>>,
): Promise<DependencyCheckResult> {
  const start = Date.now();
  return fn().then((result) => ({ ...result, latencyMs: Date.now() - start }));
}

async function checkDatabase(
  deps: HealthCheckDependencies,
): Promise<DependencyCheckResult> {
  return timedCheck(async () => {
    const db = deps.getDatabase();
    const config = db.getConfig();
    try {
      if (!db.isInitialized()) {
        await db.initialize();
      }
      return {
        status: 'ok',
        detail: { type: config.type },
      };
    } catch (error) {
      return {
        status: 'unavailable',
        message:
          error instanceof Error ? error.message : 'Database check failed',
        detail: { type: config.type },
      };
    }
  });
}

async function checkMetrics(
  deps: HealthCheckDependencies,
): Promise<DependencyCheckResult> {
  return timedCheck(async () => {
    const endpoint = deps.prometheusEndpoint || DEFAULT_PROMETHEUS_ENDPOINT;
    const healthPath =
      deps.prometheusHealthPath || DEFAULT_PROMETHEUS_HEALTH_PATH;

    const adapter = deps.createPrometheusAdapter({
      endpoint,
      healthPath,
      timeoutMs: deps.prometheusTimeoutMs,
      enabled: true,
    });

    const config = await adapter.resolveConfig();
    if (!config) {
      return {
        status: 'not_configured',
        message: 'Prometheus metrics endpoint not configured',
      };
    }

    try {
      const health = await adapter.queryExporterHealth(config.endpoint);
      if (health.healthy) {
        return {
          status: 'ok',
          detail: { endpoint: config.endpoint, statusCode: health.statusCode },
        };
      }
      return {
        status: 'degraded',
        message: `Metrics exporter unhealthy (HTTP ${health.statusCode})`,
        detail: { endpoint: config.endpoint, statusCode: health.statusCode },
      };
    } catch (error) {
      return {
        status: 'degraded',
        message:
          error instanceof Error
            ? error.message
            : 'Metrics exporter health check failed',
        detail: { endpoint: config.endpoint },
      };
    }
  });
}

async function checkBackend(
  deps: HealthCheckDependencies,
): Promise<DependencyCheckResult> {
  const backendUrl = deps.backendUrl;
  if (!backendUrl) {
    return {
      status: 'not_configured',
      latencyMs: 0,
      message: 'Backend not configured (mock mode)',
    };
  }

  return timedCheck(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.backendTimeoutMs);
    try {
      const response = await deps.fetchImpl(`${backendUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      // Any HTTP response (including 4xx/5xx) means the backend is reachable.
      return {
        status: 'ok',
        detail: { endpoint: backendUrl, statusCode: response.status },
      };
    } catch {
      return {
        status: 'unavailable',
        message: 'Backend unreachable',
        detail: { endpoint: backendUrl },
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

function checkConfigPresence(label: string, configured: boolean): DependencyCheckResult {
  if (configured) {
    return { status: 'ok', latencyMs: 0, message: `${label} configured` };
  }
  return {
    status: 'not_configured',
    latencyMs: 0,
    message: `${label} not configured`,
  };
}

function deriveOverallStatus(
  database: DependencyCheckResult,
  metrics: DependencyCheckResult,
  backend: DependencyCheckResult,
): OverallHealthStatus {
  // checkBackend only probes when the backend is configured, so an
  // "unavailable" backend always means a configured-but-down dependency.
  const criticalUnavailable =
    database.status === 'unavailable' || backend.status === 'unavailable';

  if (criticalUnavailable) {
    return 'unhealthy';
  }

  if (
    database.status === 'degraded' ||
    metrics.status === 'degraded' ||
    metrics.status === 'unavailable' ||
    backend.status === 'degraded'
  ) {
    return 'degraded';
  }

  return 'healthy';
}

export function defaultHealthCheckDependencies(): HealthCheckDependencies {
  return {
    getDatabase,
    createPrometheusAdapter: createPrometheusMetricsExportDependencies,
    getStoredSmtpConfig,
    prometheusEndpoint:
      process.env.PROMETHEUS_ENDPOINT || DEFAULT_PROMETHEUS_ENDPOINT,
    prometheusHealthPath:
      process.env.PROMETHEUS_HEALTH_PATH || DEFAULT_PROMETHEUS_HEALTH_PATH,
    prometheusTimeoutMs: parseInt(
      process.env.PROMETHEUS_TIMEOUT_MS || String(PROMETHEUS_FETCH_TIMEOUT_MS),
      10,
    ),
    backendUrl: process.env.NEXT_PUBLIC_API_URL || undefined,
    backendTimeoutMs: API_FETCH_TIMEOUT_MS,
    fetchImpl: fetch,
    env: process.env,
    startTimeMs: Date.now(),
    now: () => new Date(),
  };
}

export async function checkDependencyHealth(
  deps: HealthCheckDependencies,
): Promise<HealthCheckReport> {
  const now = deps.now();
  const timestamp = now.toISOString();
  const uptimeSec = Math.max(
    0,
    Math.floor((now.getTime() - deps.startTimeMs) / 1000),
  );

  const [database, metrics, backend] = await Promise.all([
    checkDatabase(deps),
    checkMetrics(deps),
    checkBackend(deps),
  ]);

  const dependencies: Record<string, DependencyCheckResult> = {
    database,
    metrics,
    backend,
    smtp: checkConfigPresence('SMTP', !!deps.getStoredSmtpConfig()),
    slack: checkConfigPresence('Slack', !!deps.env.SLACK_BOT_TOKEN),
    discord: checkConfigPresence('Discord', !!deps.env.DISCORD_WEBHOOK_URL),
    github: checkConfigPresence('GitHub', !!deps.env.GITHUB_ACTIONS_TOKEN),
    jira: checkConfigPresence('Jira', !!deps.env.JIRA_API_TOKEN),
    linear: checkConfigPresence('Linear', !!deps.env.LINEAR_API_KEY),
    sentry: checkConfigPresence('Sentry', !!deps.env.NEXT_PUBLIC_SENTRY_DSN),
    datadog: checkConfigPresence('Datadog', isEnabled(deps.env.DATADOG_ENABLED)),
  };

  return {
    status: deriveOverallStatus(database, metrics, backend),
    timestamp,
    uptimeSec,
    version: HEALTH_CHECK_VERSION,
    dependencies,
  };
}

/**
 * GET /api/health
 * Health check with dependency status.
 *
 * Returns an aggregate report for the dashboard's core dependencies:
 * database, Prometheus metrics exporter, and the optional backend, plus
 * config presence for each integration. Responds 503 only when a critical
 * dependency (database, or a configured backend) is unavailable.
 */
export async function GET() {
  try {
    const report = await checkDependencyHealth(
      defaultHealthCheckDependencies(),
    );
    const httpStatus = report.status === 'unhealthy' ? 503 : 200;
    return successResponse(report, { status: httpStatus });
  } catch (error) {
    logger.error('GET /api/health failed', { error });
    return successResponse(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptimeSec: 0,
        version: HEALTH_CHECK_VERSION,
        dependencies: {},
        error:
          error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 503 },
    );
  }
}
