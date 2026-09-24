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

  describe('when no scrape token is configured', () => {
    beforeEach(() => {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    });

    it('allows requests without an Authorization header', () => {
      expect(validateMetricsScrapeAuth(makeRequest())).toBeUndefined();
    });
  });

  describe('when a scrape token is configured', () => {
    const VALID_TOKEN = 'scrape-token-secret';

    beforeEach(() => {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = VALID_TOKEN;
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
  });
});

// ─── GET /api/health/metrics wiring ──────────────────────────────────────────

describe('GET /api/health/metrics', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CRASHLAB_METRICS_SCRAPE_TOKEN;
    } else {
      process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = original;
    }
  });

  it('returns 200 when unauthenticated by default (no token configured)', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 401 when a scrape token is configured and the header is missing', async () => {
    process.env.CRASHLAB_METRICS_SCRAPE_TOKEN = 'scrape-token-secret';
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