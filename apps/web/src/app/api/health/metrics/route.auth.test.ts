import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getMetricsScrapeToken,
  validateMetricsScrapeAuth,
} from '../../../../lib/api-key-auth';
import { GET } from './route';

vi.mock('../../../../lib/integrations/prometheus-adapter', () => ({
  createPrometheusMetricsExportDependencies: () => ({
    resolveConfig: async () => null,
    pushMetrics: async () => ({ accepted: true, pushedSeries: 1 }),
    queryExporterHealth: async () => ({ healthy: true, statusCode: 200 }),
  }),
}));

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/health/metrics', { headers });
}

// ─── getMetricsScrapeToken ───────────────────────────────────────────────────

describe('getMetricsScrapeToken', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    } else {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = original;
    }
  });

  it('returns undefined when the env var is not set', () => {
    delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    expect(getMetricsScrapeToken()).toBeUndefined();
  });

  it('returns undefined when the env var is empty or whitespace', () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = '   ';
    expect(getMetricsScrapeToken()).toBeUndefined();
  });

  it('returns the trimmed value when set', () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = '  scrape-secret  ';
    expect(getMetricsScrapeToken()).toBe('scrape-secret');
  });
});

// ─── validateMetricsScrapeAuth ───────────────────────────────────────────────

describe('validateMetricsScrapeAuth', () => {
  let originalToken: string | undefined;
  let originalAllow: string | undefined;

  beforeEach(() => {
    originalToken = process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    originalAllow = process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    } else {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = originalToken;
    }
    if (originalAllow === undefined) {
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    } else {
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS = originalAllow;
    }
  });

  describe('when no scrape token is configured and no escape hatch', () => {
    beforeEach(() => {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    });

    it('rejects requests without an Authorization header with 503', async () => {
      const res = validateMetricsScrapeAuth(makeRequest());
      expect(res).not.toBeUndefined();
      expect(res!.status).toBe(503);
      const body = await res!.json();
      expect(body.error).toMatch(/Metrics authentication is not configured/i);
      expect(body.code).toBe('METRICS_AUTH_NOT_CONFIGURED');
    });
  });

  describe('when no scrape token is configured but escape hatch is enabled', () => {
    beforeEach(() => {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS = '1';
    });

    it('allows requests without an Authorization header', () => {
      const res = validateMetricsScrapeAuth(makeRequest());
      expect(res).toBeUndefined();
    });
  });

  describe('when a scrape token is configured', () => {
    const VALID_TOKEN = 'scrape-token-secret';

    beforeEach(() => {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = VALID_TOKEN;
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    });

    it('allows a request with the correct Bearer token', () => {
      expect(
        validateMetricsScrapeAuth(makeRequest({ authorization: `Bearer ${VALID_TOKEN}` })),
      ).toBeUndefined();
    });

    it('rejects a request with no Authorization header with 401', async () => {
      const res = validateMetricsScrapeAuth(makeRequest());
      expect(res).not.toBeUndefined();
      expect(res!.status).toBe(401);
      const body = await res!.json();
      expect(body.error).toMatch(/Authentication required/i);
    });

    it('rejects a request with a wrong token with 401', async () => {
      const res = validateMetricsScrapeAuth(makeRequest({ authorization: 'Bearer wrong' }));
      expect(res).not.toBeUndefined();
      expect(res!.status).toBe(401);
    });

    it('rejects a non-Bearer scheme with 401', () => {
      const res = validateMetricsScrapeAuth(makeRequest({ authorization: `Basic ${VALID_TOKEN}` }));
      expect(res).not.toBeUndefined();
      expect(res!.status).toBe(401);
    });

    it('escape hatch is ignored when token is configured', () => {
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS = '1';
      const res = validateMetricsScrapeAuth(makeRequest());
      expect(res).not.toBeUndefined();
      expect(res!.status).toBe(401);
    });
  });
});

// ─── GET /api/health/metrics wiring ──────────────────────────────────────────

describe('GET /api/health/metrics', () => {
  let originalToken: string | undefined;
  let originalAllow: string | undefined;

  beforeEach(() => {
    originalToken = process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    originalAllow = process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    } else {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = originalToken;
    }
    if (originalAllow === undefined) {
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    } else {
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS = originalAllow;
    }
  });

  it('returns 503 when unauthenticated and no escape hatch (no token configured)', async () => {
    delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Metrics authentication is not configured/i);
  });

  it('returns 200 when unauthenticated and escape hatch is enabled (no token configured)', async () => {
    delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS = '1';
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 401 when a scrape token is configured and the header is missing', async () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = 'scrape-token-secret';
    delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_METRICS;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authentication required/i);
  });

  it('returns 401 when the bearer token does not match', async () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = 'scrape-token-secret';
    const res = await GET(makeRequest({ authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for an authorized scrape with the correct token', async () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = 'scrape-token-secret';
    const res = await GET(
      makeRequest({ authorization: 'Bearer scrape-token-secret' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.status).toBe('healthy');
  });
});