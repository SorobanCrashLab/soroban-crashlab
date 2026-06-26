import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './rate-limit';

describe('API Rate Limit Middleware', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset global state
    const globalForRateLimit = globalThis as unknown as Record<string, unknown>;
    const buckets = globalForRateLimit.crashlabApiRateLimitBuckets as Map<string, unknown> | undefined;
    if (buckets) {
      buckets.clear();
    }
    delete globalForRateLimit.crashlabApiRateLimitLastCleanup;
  });

  function makeRequest(
    ip: string,
    method: string = 'GET',
    path: string = '/api/runs',
  ): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
      },
    });
  }

  it('allows requests within the rate limit', () => {
    const request = makeRequest('192.168.1.1');
    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('RateLimit-Limit')).toBe('120');
    expect(response.headers.get('RateLimit-Remaining')).toBe('119');
  });

  it('tracks and increments request count per IP', () => {
    const ip = '192.168.1.1';
    const req1 = makeRequest(ip);
    const res1 = proxy(req1);

    const req2 = makeRequest(ip);
    const res2 = proxy(req2);

    expect(res1.headers.get('RateLimit-Remaining')).toBe('119');
    expect(res2.headers.get('RateLimit-Remaining')).toBe('118');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const ip = '10.0.0.1';
    
    // Make 121 requests (exceeds limit of 120)
    for (let i = 0; i < 121; i++) {
      const request = makeRequest(ip);
      const response = proxy(request);
      
      if (i < 120) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
        const json = await response.json();
        expect(json).toHaveProperty('error', 'rate_limited');
      }
    }
  });

  it('includes Retry-After header on 429 response', () => {
    const ip = '10.0.0.2';
    
    // Exceed rate limit
    for (let i = 0; i < 121; i++) {
      const request = makeRequest(ip);
      const response = proxy(request);
      
      if (i === 120) {
        expect(response.status).toBe(429);
        const retryAfter = response.headers.get('Retry-After');
        expect(retryAfter).toBeDefined();
        expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('extracts IP from x-forwarded-for header', () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '203.0.113.1, 192.0.2.1',
      },
    });

    const res1 = proxy(req);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('RateLimit-Remaining')).toBe('119');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: {
        'x-real-ip': '198.51.100.1',
      },
    });

    const res1 = proxy(req);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('RateLimit-Remaining')).toBe('119');
  });

  it('allows OPTIONS requests without rate limiting', () => {
    const req = new NextRequest('http://localhost/api/runs', {
      method: 'OPTIONS',
      headers: {
        'x-forwarded-for': '203.0.113.2',
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(200);
  });
});
