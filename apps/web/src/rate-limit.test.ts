import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './rate-limit';
import { InMemoryRecordDriver, setRecordDriver, resetRecordDriver } from './lib/storage/record-driver';
import { resetRoleStore } from './lib/storage/role-store';
import {
  hashTokenSecret,
  registerTokenPrincipal,
  resetTokenPrincipalStore,
} from './lib/storage/token-principal-store';
import { installTestLimiters, resetPrincipalLimiters, RATE_LIMIT_POLICIES } from './lib/rate-limit';

/**
 * Proxy-layer rate limit tests (#1810).
 *
 * Covers both layers: the IP-keyed outer limit and the principal-keyed inner
 * limit. Principal limiters use an injected clock (no real sleeps).
 */
describe('API Rate Limit Middleware', () => {
  let clockMs: number;
  let uninstallLimiters: () => void;

  function resetGlobalBuckets() {
    const globalForRateLimit = globalThis as unknown as Record<string, unknown>;
    const buckets = globalForRateLimit.crashlabApiRateLimitBuckets as Map<string, unknown> | undefined;
    if (buckets) {
      buckets.clear();
    }
    delete globalForRateLimit.crashlabApiRateLimitLastCleanup;
  }

  beforeEach(async () => {
    resetGlobalBuckets();
    clockMs = 1_700_000_000_000;
    uninstallLimiters = installTestLimiters(() => clockMs);
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
    await resetTokenPrincipalStore();
  });

  afterEach(() => {
    resetRecordDriver();
    uninstallLimiters();
    resetPrincipalLimiters();
  });

  function makeRequest(
    ip: string,
    method: string = 'GET',
    path: string = '/api/runs',
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
        ...headers,
      },
    });
  }

  // ── IP layer (unchanged) ────────────────────────────────────────────────────

  it('allows requests within the rate limit', async () => {
    const request = makeRequest('192.168.1.1');
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('RateLimit-Limit')).toBe('120');
    expect(response.headers.get('RateLimit-Remaining')).toBe('119');
  });

  it('tracks and increments request count per IP', async () => {
    const ip = '192.168.1.1';
    const req1 = makeRequest(ip);
    const res1 = await proxy(req1);

    const req2 = makeRequest(ip);
    const res2 = await proxy(req2);

    expect(Number(res1.headers.get('RateLimit-Remaining'))).toBe(119);
    expect(Number(res2.headers.get('RateLimit-Remaining'))).toBe(118);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const ip = '10.0.0.1';
    const limit = 120;

    for (let i = 0; i <= limit; i++) {
      const request = makeRequest(ip);
      const response = await proxy(request);
      if (i < limit) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
        const json = await response.json();
        // #1810: envelope now includes the machine-readable `code` field.
        expect(json).toHaveProperty('code', 'RATE_LIMITED');
      }
    }
  });

  it('includes Retry-After header on 429 response', async () => {
    const ip = '10.0.0.2';
    for (let i = 0; i <= 120; i++) {
      const request = makeRequest(ip);
      const response = await proxy(request);
      if (i === 120) {
        expect(response.status).toBe(429);
        const retryAfter = response.headers.get('Retry-After');
        expect(retryAfter).toBeDefined();
        expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('extracts IP from x-forwarded-for header', async () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '203.0.113.1, 192.0.2.1',
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('RateLimit-Remaining'))).toBe(119);
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', async () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: {
        'x-real-ip': '198.51.100.1',
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('RateLimit-Remaining'))).toBe(119);
  });

  it('allows OPTIONS requests without rate limiting', async () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'OPTIONS',
      headers: {
        'x-forwarded-for': '203.0.113.2',
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it('429 response uses coded error envelope with RATE_LIMITED code', async () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 121; i++) {
      const request = makeRequest(ip);
      const response = await proxy(request);
      if (i === 120) {
        expect(response.status).toBe(429);
        const json = await response.json();
        expect(json).toHaveProperty('code', 'RATE_LIMITED');
        expect(json).toHaveProperty('error');
      }
    }
  });

  // ── Per-principal layer (#1810) ────────────────────────────────────────────

  it('two different principals sharing an IP get independent buckets', async () => {
    // Register two API tokens so they resolve to distinct principals.
    const tokenA = 'tok_A_test_secret_value';
    const tokenB = 'tok_B_test_secret_value';
    await registerTokenPrincipal({
      tokenId: 'tok_A',
      sha256Hash: await hashTokenSecret(tokenA),
    });
    await registerTokenPrincipal({
      tokenId: 'tok_B',
      sha256Hash: await hashTokenSecret(tokenB),
    });

    // Hit /api/auth/github (auth route class, limit = 20) with token A until
    // it is exhausted.
    const ip = '10.0.0.10';
    const authLimit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i <= authLimit; i++) {
      const r = await proxy(
        makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${tokenA}` }),
      );
      if (i >= authLimit) {
        expect(r.status).toBe(429);
      }
    }

    // Token B from the same IP should still be allowed (independent bucket).
    const r = await proxy(
      makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${tokenB}` }),
    );
    expect(r.status).toBe(200);
  });

  it('exhausted principal recovers after the window elapses', async () => {
    const token = 'tok_recover_test_secret';
    await registerTokenPrincipal({
      tokenId: 'tok_recover',
      sha256Hash: await hashTokenSecret(token),
    });

    const ip = '10.0.0.11';
    const authLimit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i <= authLimit; i++) {
      await proxy(
        makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
      );
    }

    // At window start: blocked.
    let r = await proxy(
      makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
    );
    expect(r.status).toBe(429);

    // Advance the injected clock past the window.
    clockMs += RATE_LIMIT_POLICIES.auth.windowMs + 1;

    // Should be allowed again — fresh window, fresh budget.
    r = await proxy(
      makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
    );
    expect(r.status).toBe(200);
  });

  it('anonymous requests share a single bucket (intended behaviour)', async () => {
    // No bearer token → anonymous principal.
    const ip = '10.0.0.12';
    const authLimit = RATE_LIMIT_POLICIES.auth.limit;

    for (let i = 0; i <= authLimit; i++) {
      await proxy(makeRequest(ip, 'POST', '/api/auth/github'));
    }

    const r = await proxy(makeRequest(ip, 'POST', '/api/auth/github'));
    expect(r.status).toBe(429);
  });

  it('429 from per-principal layer carries Retry-After and code', async () => {
    const token = 'tok_429_test_secret';
    await registerTokenPrincipal({
      tokenId: 'tok_429',
      sha256Hash: await hashTokenSecret(token),
    });

    const ip = '10.0.0.13';
    const authLimit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i < authLimit; i++) {
      await proxy(
        makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
      );
    }

    const rejected = await proxy(
      makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
    );
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('Retry-After')).toBeDefined();
    expect(Number(rejected.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);

    const json = await rejected.json();
    expect(json).toHaveProperty('code', 'RATE_LIMITED');
  });

  it('does not echo the bearer token in the 429 body', async () => {
    const token = 'tok_secret_do_not_leak_in_body';
    await registerTokenPrincipal({
      tokenId: 'tok_secret',
      sha256Hash: await hashTokenSecret(token),
    });

    const ip = '10.0.0.14';
    const authLimit = RATE_LIMIT_POLICIES.auth.limit;
    for (let i = 0; i <= authLimit; i++) {
      await proxy(
        makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
      );
    }

    const r = await proxy(
      makeRequest(ip, 'POST', '/api/auth/github', { Authorization: `Bearer ${token}` }),
    );
    expect(r.status).toBe(429);
    const text = await r.text();
    // The token value must never appear in the response body.
    expect(text).not.toContain(token);
  });

  it('default route class is fail-open with the documented limit', async () => {
    // A GET request to a non-listed route resolves to the default class.
    const ip = '10.0.0.15';
    const r = await proxy(makeRequest(ip, 'GET', '/api/health'));
    expect(r.status).toBe(200);
  });
});
