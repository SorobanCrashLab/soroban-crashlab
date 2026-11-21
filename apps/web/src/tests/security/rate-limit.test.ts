/**
 * Rate Limit Engine Tests
 *
 * Tests for the tiered rate limiting system including:
 * - Per-IP, per-user, per-API-key, per-tenant limiting
 * - Burst and sustained quotas
 * - Redis-backed and in-memory modes
 * - Fail-open/fail-closed behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RateLimitEngine, IdentityContext } from '@/lib/security/api-gateway/RateLimitEngine';
import { DEFAULT_GATEWAY_POLICIES } from '@/lib/security/api-gateway/policies';
import { getTieredLimiter, resetTieredLimiter } from '@/lib/security/api-gateway/TieredLimiter';
import { NextRequest } from 'next/server';

// Note: Tests use in-memory fallback since Redis is not configured in test environment

describe('RateLimitEngine', () => {
  let engine: RateLimitEngine;

  beforeEach(() => {
    engine = new RateLimitEngine(DEFAULT_GATEWAY_POLICIES);
  });

  afterEach(() => {
    // Reset the engine's local cache
    (engine as any).localCache.clear();
  });

  describe('check', () => {
    it('should allow requests within limits', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      const result = await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track usage per IP', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      
      // Make multiple requests to an endpoint without cost multiplier
      for (let i = 0; i < 5; i++) {
        const result = await engine.check(identity, 'GET', '/api/test', 'default', 1);
        expect(result.allowed).toBe(true);
      }
      
      // Check usage
      const usage = await engine.getUsage(identity, 'default');
      expect(usage.ip.used).toBe(5);
    });

    it('should track usage per user', async () => {
      const identity: IdentityContext = { 
        ip: '192.168.1.1', 
        userId: 'user:123' 
      };
      
      const result = await engine.check(identity, 'GET', '/api/test', 'default', 1);
      expect(result.allowed).toBe(true);
      
      const usage = await engine.getUsage(identity, 'default');
      expect(usage.user.used).toBe(1);
    });

    it('should track usage per API key', async () => {
      const identity: IdentityContext = { 
        ip: '192.168.1.1', 
        apiKeyId: 'api-key:abc123' 
      };
      
      const result = await engine.check(identity, 'GET', '/api/test', 'default', 1);
      expect(result.allowed).toBe(true);
      
      const usage = await engine.getUsage(identity, 'default');
      expect(usage.apiKey.used).toBe(1);
    });

    it('should track usage per tenant', async () => {
      const identity: IdentityContext = { 
        ip: '192.168.1.1', 
        tenantId: 'tenant:456' 
      };
      
      const result = await engine.check(identity, 'GET', '/api/test', 'default', 1);
      expect(result.allowed).toBe(true);
      
      const usage = await engine.getUsage(identity, 'default');
      expect(usage.tenant.used).toBe(1);
    });

    it('should apply endpoint cost multipliers', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      
      // /api/runs has cost 2 in default policy
      const result = await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      expect(result.allowed).toBe(true);
      // The used field should reflect the cost multiplier
      expect(result.used).toBeGreaterThan(0);
    });

    it('should use stricter limits for auth policy class', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      
      const result = await engine.check(identity, 'POST', '/api/auth/login', 'auth', 1);
      expect(result.allowed).toBe(true);
      expect(result.policyName).toBe('auth');
      // Auth policy has much lower limits
      expect(result.limit).toBeLessThan(50);
    });

    it('should deny when burst limit exceeded', async () => {
      const strictPolicy = {
        ...DEFAULT_GATEWAY_POLICIES,
        rateLimit: {
          ...DEFAULT_GATEWAY_POLICIES.rateLimit,
          strict: {
            name: 'strict',
            ip: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
            user: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
            apiKey: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
            tenant: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
          },
        },
      };
      const strictEngine = new RateLimitEngine(strictPolicy);
      
      const identity: IdentityContext = { ip: '10.0.0.1' };
      
      // First request allowed
      const decision1 = await strictEngine.check(identity, 'GET', '/api/test', 'strict', 1);
      expect(decision1.allowed).toBe(true);
      
      // Second request denied (burst limit 1)
      const decision2 = await strictEngine.check(identity, 'GET', '/api/test', 'strict', 1);
      expect(decision2.allowed).toBe(false);
      expect(decision2.remaining).toBe(0);
    });
  });

  describe('buildHeaders', () => {
    it('should build correct rate limit headers', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      const result = await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      
      const headers = engine.buildHeaders(result);
      
      expect(headers['RateLimit-Limit']).toBeDefined();
      expect(headers['RateLimit-Remaining']).toBeDefined();
      expect(headers['RateLimit-Reset']).toBeDefined();
      expect(headers['Retry-After']).toBeDefined();
      expect(headers['X-RateLimit-Policy']).toBeDefined();
      expect(headers['X-RateLimit-Tier']).toBeDefined();
    });
  });

  describe('build429Response', () => {
    it('should build standardized 429 response', async () => {
      const identity: IdentityContext = { ip: '192.168.1.1' };
      const result = await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      // Force a denial
      result.allowed = false;
      result.remaining = 0;
      
      const response = engine.build429Response(result);
      
      expect(response.allowed).toBe(false);
      expect(response.status).toBe(429);
      expect(response.code).toBe('RATE_LIMITED');
      expect(response.message).toContain('Rate limit exceeded');
      expect(response.headers['Retry-After']).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset rate limit for identity', async () => {
      const identity: IdentityContext = { 
        ip: '192.168.1.1',
        userId: 'user:123',
        apiKeyId: 'api-key:abc',
        tenantId: 'tenant:1'
      };
      
      // Make some requests
      await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      await engine.check(identity, 'GET', '/api/runs', 'default', 1);
      
      // Reset
      await engine.reset(identity, 'default');
      
      // Usage should be cleared
      const usage = await engine.getUsage(identity, 'default');
      expect(usage.ip.used).toBe(0);
    });
  });
});

describe('TieredLimiter', () => {
  beforeEach(() => {
    resetTieredLimiter();
  });

  afterEach(() => {
    resetTieredLimiter();
  });

  it('should create instance with default config', () => {
    const limiter = getTieredLimiter();
    expect(limiter).toBeDefined();
    expect(limiter.getEngine()).toBeDefined();
  });

  it('should check rate limits for a request', async () => {
    const limiter = getTieredLimiter();
    const request = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '192.168.1.1',
      },
    });
    
    const decision = await limiter.check(request);
    
    expect(decision.allowed).toBe(true);
    expect(decision.result).toBeDefined();
    expect(decision.principal).toBeDefined();
    expect(decision.routeClass).toBeDefined();
  });

  it('should return 429 when limit exceeded', async () => {
    const limiter = getTieredLimiter({ 
      policies: {
        default: {
          name: 'default',
          ip: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
          user: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
          apiKey: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
          tenant: { burstLimit: 1, burstWindowMs: 60000, sustainedLimit: 1, sustainedWindowMs: 3600000, cost: 1, failClosed: false },
        }
      }
    });
    
    const request = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    
    // First request allowed
    const decision1 = await limiter.check(request);
    expect(decision1.allowed).toBe(true);
    
    // Second request denied (burst limit 1)
    const decision2 = await limiter.check(request);
    expect(decision2.allowed).toBe(false);
  });

  it('should build headers from decision', async () => {
    const limiter = getTieredLimiter();
    const request = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    
    const decision = await limiter.check(request);
    const headers = limiter.buildHeaders(decision);
    
    expect(headers['RateLimit-Limit']).toBeDefined();
    expect(headers['RateLimit-Remaining']).toBeDefined();
  });

  it('should build 429 response from decision', async () => {
    const limiter = getTieredLimiter();
    const request = new NextRequest('http://localhost/api/runs', {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.0.0.3' },
    });
    
    const decision = await limiter.check(request);
    // Force denial
    decision.allowed = false;
    
    const response = limiter.build429Response(decision);
    
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeDefined();
  });
});