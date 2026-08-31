import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkDependencyHealth,
  GET,
  type HealthCheckDependencies,
} from './route';
import { getDatabase } from '@/lib/database/db-init';
import { createPrometheusMetricsExportDependencies } from '@/lib/integrations/prometheus-adapter';
import { getStoredSmtpConfig } from '@/lib/integrations/smtp-store';

vi.mock('@/lib/database/db-init', () => ({
  getDatabase: vi.fn(),
}));
vi.mock('@/lib/integrations/prometheus-adapter', () => ({
  createPrometheusMetricsExportDependencies: vi.fn(),
}));
vi.mock('@/lib/integrations/smtp-store', () => ({
  getStoredSmtpConfig: vi.fn(() => null),
}));

type Mocked<T> = ReturnType<typeof vi.fn> & T;

interface FakePrometheusAdapter {
  resolveConfig: () => Promise<{
    endpoint: string;
    interval: number;
    enabled: boolean;
    labels: Record<string, string>;
  } | null>;
  pushMetrics: () => Promise<{ accepted: boolean; pushedSeries: number }>;
  queryExporterHealth: () => Promise<{ healthy: boolean; statusCode: number }>;
}

function buildDeps(overrides: Partial<HealthCheckDependencies> = {}): HealthCheckDependencies {
  const fakeDb = {
    getConfig: () => ({ type: 'sqlite' }),
    isInitialized: () => true,
    initialize: () => Promise.resolve(),
  };

  const fakeAdapter: FakePrometheusAdapter = {
    resolveConfig: () =>
      Promise.resolve({
        endpoint: 'http://localhost:9090',
        interval: 15,
        enabled: true,
        labels: {},
      }),
    pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
    queryExporterHealth: () => Promise.resolve({ healthy: true, statusCode: 200 }),
  };

  return {
    getDatabase: () => fakeDb,
    createPrometheusAdapter: () => fakeAdapter,
    getStoredSmtpConfig: () => null,
    prometheusEndpoint: 'http://localhost:9090',
    prometheusHealthPath: '/-/healthy',
    prometheusTimeoutMs: 1000,
    backendUrl: undefined,
    backendTimeoutMs: 1000,
    fetchImpl: fetch,
    env: {} as NodeJS.ProcessEnv,
    startTimeMs: Date.parse('2026-01-01T00:00:00.000Z'),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function mockHealthyDependencies(): void {
  const db = {
    getConfig: () => ({ type: 'sqlite' }),
    isInitialized: () => true,
    initialize: () => Promise.resolve(),
  };
  (getDatabase as Mocked<typeof getDatabase>).mockReturnValue(db);

  const adapter: FakePrometheusAdapter = {
    resolveConfig: () =>
      Promise.resolve({
        endpoint: 'http://localhost:9090',
        interval: 15,
        enabled: true,
        labels: {},
      }),
    pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
    queryExporterHealth: () => Promise.resolve({ healthy: true, statusCode: 200 }),
  };
  (
    createPrometheusMetricsExportDependencies as Mocked<
      typeof createPrometheusMetricsExportDependencies
    >
  ).mockReturnValue(adapter);

  (getStoredSmtpConfig as Mocked<typeof getStoredSmtpConfig>).mockReturnValue(null);
}

beforeEach(() => {
  mockHealthyDependencies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkDependencyHealth', () => {
  it('reports healthy when all core dependencies are ok', async () => {
    const report = await checkDependencyHealth(buildDeps());

    expect(report.status).toBe('healthy');
    expect(report.version).toBe('1.0.0');
    expect(report.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(report.uptimeSec).toBe(0);
    expect(report.dependencies.database.status).toBe('ok');
    expect(report.dependencies.metrics.status).toBe('ok');
    expect(report.dependencies.backend.status).toBe('not_configured');
  });

  it('marks unconfigured optional integrations as not_configured', async () => {
    const report = await checkDependencyHealth(buildDeps());

    for (const key of ['smtp', 'slack', 'discord', 'github', 'jira', 'linear', 'sentry']) {
      expect(report.dependencies[key].status).toBe('not_configured');
    }
    expect(report.dependencies.datadog.status).toBe('not_configured');
  });

  it('marks configured optional integrations as ok', async () => {
    const deps = buildDeps({
      env: {
        SLACK_BOT_TOKEN: 'xoxb-123',
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/abc',
        GITHUB_ACTIONS_TOKEN: 'ghp_123',
        JIRA_API_TOKEN: 'jira-token',
        LINEAR_API_KEY: 'lin-key',
        NEXT_PUBLIC_SENTRY_DSN: 'https://dsn@sentry.io/1',
        DATADOG_ENABLED: 'true',
      } as unknown as NodeJS.ProcessEnv,
      getStoredSmtpConfig: () => ({ host: 'smtp.example.com' }),
    });

    const report = await checkDependencyHealth(deps);

    for (const key of ['smtp', 'slack', 'discord', 'github', 'jira', 'linear', 'sentry', 'datadog']) {
      expect(report.dependencies[key].status).toBe('ok');
    }
  });

  it('reports unavailable when the database fails to initialize', async () => {
    const deps = buildDeps({
      getDatabase: () => ({
        getConfig: () => ({ type: 'postgres' }),
        isInitialized: () => false,
        initialize: () => Promise.reject(new Error('Connection refused')),
      }),
    });

    const report = await checkDependencyHealth(deps);

    expect(report.status).toBe('unhealthy');
    expect(report.dependencies.database.status).toBe('unavailable');
    expect(report.dependencies.database.message).toBe('Connection refused');
    expect(report.dependencies.database.detail).toEqual({ type: 'postgres' });
  });

  it('degrades when the metrics exporter is unhealthy', async () => {
    const fakeAdapter: FakePrometheusAdapter = {
      resolveConfig: () =>
        Promise.resolve({
          endpoint: 'http://localhost:9090',
          interval: 15,
          enabled: true,
          labels: {},
        }),
      pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
      queryExporterHealth: () =>
        Promise.resolve({ healthy: false, statusCode: 503 }),
    };

    const deps = buildDeps({ createPrometheusAdapter: () => fakeAdapter });
    const report = await checkDependencyHealth(deps);

    expect(report.status).toBe('degraded');
    expect(report.dependencies.metrics.status).toBe('degraded');
    expect(report.dependencies.metrics.detail).toMatchObject({ statusCode: 503 });
  });

  it('degrades when the metrics exporter is unreachable', async () => {
    const fakeAdapter: FakePrometheusAdapter = {
      resolveConfig: () =>
        Promise.resolve({
          endpoint: 'http://localhost:9090',
          interval: 15,
          enabled: true,
          labels: {},
        }),
      pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
      queryExporterHealth: () =>
        Promise.reject(new Error('ECONNREFUSED')),
    };

    const deps = buildDeps({ createPrometheusAdapter: () => fakeAdapter });
    const report = await checkDependencyHealth(deps);

    expect(report.status).toBe('degraded');
    expect(report.dependencies.metrics.status).toBe('degraded');
  });

  it('marks metrics not_configured when resolveConfig returns null', async () => {
    const fakeAdapter: FakePrometheusAdapter = {
      resolveConfig: () => Promise.resolve(null),
      pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
      queryExporterHealth: () =>
        Promise.reject(new Error('should not be called')),
    };

    const deps = buildDeps({ createPrometheusAdapter: () => fakeAdapter });
    const report = await checkDependencyHealth(deps);

    expect(report.dependencies.metrics.status).toBe('not_configured');
  });

  it('reports ok when a configured backend responds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const deps = buildDeps({
      backendUrl: 'http://localhost:8080',
      fetchImpl,
    });
    const report = await checkDependencyHealth(deps);

    expect(report.status).toBe('healthy');
    expect(report.dependencies.backend.status).toBe('ok');
    expect(report.dependencies.backend.detail).toMatchObject({
      endpoint: 'http://localhost:8080',
      statusCode: 200,
    });
  });

  it('reports unhealthy when a configured backend is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      new TypeError('fetch failed'),
    ) as unknown as typeof fetch;

    const deps = buildDeps({
      backendUrl: 'http://localhost:8080',
      fetchImpl,
    });
    const report = await checkDependencyHealth(deps);

    expect(report.status).toBe('unhealthy');
    expect(report.dependencies.backend.status).toBe('unavailable');
    expect(report.dependencies.backend.message).toBe('Backend unreachable');
  });

  it('records latency on probed dependencies', async () => {
    const report = await checkDependencyHealth(buildDeps());

    expect(typeof report.dependencies.database.latencyMs).toBe('number');
    expect(typeof report.dependencies.metrics.latencyMs).toBe('number');
    expect(report.dependencies.backend.latencyMs).toBe(0);
  });
});

describe('GET /api/health', () => {
  it('returns 200 with a healthy report when dependencies are ok', async () => {
    mockHealthyDependencies();
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.status).toBe('healthy');
    expect(body.data.dependencies.database.status).toBe('ok');
    expect(body.data.dependencies.metrics.status).toBe('ok');
  });

  it('returns 200 when the report is degraded', async () => {
    const adapter: FakePrometheusAdapter = {
      resolveConfig: () =>
        Promise.resolve({
          endpoint: 'http://localhost:9090',
          interval: 15,
          enabled: true,
          labels: {},
        }),
      pushMetrics: () => Promise.resolve({ accepted: true, pushedSeries: 1 }),
      queryExporterHealth: () =>
        Promise.resolve({ healthy: false, statusCode: 503 }),
    };
    (
      createPrometheusMetricsExportDependencies as Mocked<
        typeof createPrometheusMetricsExportDependencies
      >
    ).mockReturnValue(adapter);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe('degraded');
    expect(body.data.dependencies.metrics.status).toBe('degraded');
  });

  it('returns 503 when the database is unavailable', async () => {
    const db = {
      getConfig: () => ({ type: 'sqlite' }),
      isInitialized: () => false,
      initialize: () => Promise.reject(new Error('boom')),
    };
    (getDatabase as Mocked<typeof getDatabase>).mockReturnValue(db);

    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.dependencies.database.status).toBe('unavailable');
  });

  it('returns 503 when the health check throws', async () => {
    (getDatabase as Mocked<typeof getDatabase>).mockImplementation(() => {
      throw new Error('unexpected');
    });

    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.error).toBe('unexpected');
  });
});
