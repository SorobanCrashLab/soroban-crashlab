/**
 * Abuse Detection Tests
 *
 * Tests for the abuse detection engine including:
 * - Credential stuffing detection
 * - Enumeration detection
 * - Scraping detection
 * - Brute force detection
 * - Anomalous traffic detection
 * - Fingerprint generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AbuseDetector, RequestFingerprint } from '@/lib/security/api-gateway/AbuseDetector';
import { DEFAULT_ABUSE_DETECTION_CONFIG } from '@/lib/security/api-gateway/policies';
import { getAbuseDetector, resetAbuseDetector } from '@/lib/security/api-gateway/AbuseDetector';

// Mock Redis
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    eval: vi.fn(),
    evalsha: vi.fn(),
    script: vi.fn(),
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    zadd: vi.fn(),
    zcard: vi.fn(),
    zcount: vi.fn(),
    zrangebyscore: vi.fn(),
    zremrangebyscore: vi.fn(),
    zremrangebyrank: vi.fn(),
    expire: vi.fn(),
    incrby: vi.fn(),
    decr: vi.fn(),
  })),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({
    eval: vi.fn().mockResolvedValue([]),
    evalsha: vi.fn().mockRejectedValue(new Error('NOSCRIPT')),
    script: vi.fn().mockResolvedValue('mock_sha'),
  })),
  isRedisConfigured: vi.fn(() => false),
  resetRedisClient: vi.fn(),
}));

describe('AbuseDetector', () => {
  let detector: AbuseDetector;

  beforeEach(() => {
    resetAbuseDetector();
    detector = getAbuseDetector(DEFAULT_ABUSE_DETECTION_CONFIG);
  });

  afterEach(() => {
    resetAbuseDetector();
    vi.clearAllMocks();
  });

  describe('getFingerprint', () => {
    it('should generate fingerprint from request', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0 Test Browser',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate',
        },
      });

      const fingerprint = AbuseDetector.getFingerprint(request);

      expect(fingerprint.ip).toBe('192.168.1.1');
      expect(fingerprint.userAgent).toBe('Mozilla/5.0 Test Browser');
      expect(fingerprint.acceptLanguage).toBe('en-US,en;q=0.9');
      expect(fingerprint.acceptEncoding).toBe('gzip, deflate');
      expect(fingerprint.hash).toMatch(/^fp_[a-z0-9]+$/);
    });

    it('should use x-real-ip when x-forwarded-for not present', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'x-real-ip': '10.0.0.1',
          'user-agent': 'Test Agent',
        },
      });

      const fingerprint = AbuseDetector.getFingerprint(request);
      expect(fingerprint.ip).toBe('10.0.0.1');
    });

    it('should default to unknown when no IP headers', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'user-agent': 'Test Agent',
        },
      });

      const fingerprint = AbuseDetector.getFingerprint(request);
      expect(fingerprint.ip).toBe('unknown');
    });

    it('should include principal and tenant in fingerprint when provided', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Test Agent',
        },
      });

      const fingerprint = AbuseDetector.getFingerprint(request, 'user:123', 'tenant:456');
      expect(fingerprint.hash).toMatch(/^fp_[a-z0-9]+$/);
    });
  });

  describe('recordRequest', () => {
    it('should record request in sliding window', async () => {
      const request = new Request('http://localhost/api/test');
      const fingerprint = AbuseDetector.getFingerprint(request);
      
      await detector.recordRequest({
        timestamp: Date.now(),
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        fingerprint,
        responseTimeMs: 50,
        bytesSent: 100,
        bytesReceived: 1000,
      });

      // Verify local window was created
      const status = detector.getStatus();
      expect(status.localWindows).toBeGreaterThan(0);
    });

    it('should track unique paths', async () => {
      const request = new Request('http://localhost/api/test');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Record requests to different paths
      for (let i = 0; i < 5; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'GET',
          path: `/api/resource/${i}`,
          statusCode: 200,
          fingerprint,
          responseTimeMs: 50,
          bytesSent: 100,
          bytesReceived: 1000,
        });
      }

      const status = detector.getStatus();
      expect(status.localWindows).toBeGreaterThan(0);
    });

    it('should track auth failures', async () => {
      const request = new Request('http://localhost/api/auth/login');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Record failed auth attempts
      for (let i = 0; i < 5; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'POST',
          path: '/api/auth/login',
          statusCode: 401,
          fingerprint,
          principal: 'user:test',
          responseTimeMs: 100,
          bytesSent: 200,
          bytesReceived: 500,
        });
      }

      // Analyze should detect credential stuffing
      const result = await detector.analyze(fingerprint.hash);
      expect(result.detected).toBe(true);
      expect(result.type).toBe('credential-stuffing');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('analyze', () => {
    it('should return no detection for insufficient data', async () => {
      const request = new Request('http://localhost/api/test');
      const fingerprint = AbuseDetector.getFingerprint(request);
      
      // Record only a few requests
      await detector.recordRequest({
        timestamp: Date.now(),
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        fingerprint,
        responseTimeMs: 50,
        bytesSent: 100,
        bytesReceived: 1000,
      });

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(false);
      expect(result.type).toBe('none');
      expect(result.score).toBe(0);
      expect(result.action).toBe('allow');
    });

    it('should detect credential stuffing', async () => {
      const request = new Request('http://localhost/api/auth/login');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Exceed the threshold (default is 5)
      for (let i = 0; i < 10; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'POST',
          path: '/api/auth/login',
          statusCode: 401,
          fingerprint,
          principal: 'user:victim',
          responseTimeMs: 100,
          bytesSent: 200,
          bytesReceived: 500,
        });
      }

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('credential-stuffing');
      expect(result.score).toBeGreaterThanOrEqual(100);
      expect(result.action).toBe('block');
      expect(result.patterns).toContain('credential-stuffing');
    });

    it('should detect enumeration', async () => {
      const request = new Request('http://localhost/api/');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Access many unique paths (default threshold is 50)
      for (let i = 0; i < 60; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'GET',
          path: `/api/enum/${i}`,
          statusCode: 200,
          fingerprint,
          responseTimeMs: 30,
          bytesSent: 100,
          bytesReceived: 200,
        });
      }

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('enumeration');
      expect(result.score).toBeGreaterThan(0);
      expect(result.patterns).toContain('enumeration');
    });

    it('should detect scraping', async () => {
      const request = new Request('http://localhost/api/');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // High volume, low unique UAs, low entropy
      for (let i = 0; i < 250; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'GET',
          path: `/api/data/${i}`,
          statusCode: 200,
          fingerprint,
          responseTimeMs: 10,
          bytesSent: 100,
          bytesReceived: 5000,
        });
      }

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('scraping');
      expect(result.score).toBeGreaterThan(0);
      expect(result.patterns).toContain('scraping');
    });

    it('should detect brute force', async () => {
      const request = new Request('http://localhost/api/auth/reset');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Many attempts against same target (default threshold is 10)
      for (let i = 0; i < 15; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'POST',
          path: '/api/auth/reset',
          statusCode: 401,
          fingerprint,
          principal: 'user:target',
          responseTimeMs: 50,
          bytesSent: 200,
          bytesReceived: 300,
        });
      }

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('brute-force');
      expect(result.score).toBeGreaterThan(0);
      expect(result.patterns).toContain('brute-force');
    });

    it('should detect anomalous traffic', async () => {
      const request = new Request('http://localhost/api/');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // High error rate
      for (let i = 0; i < 20; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'GET',
          path: `/api/error/${i}`,
          statusCode: i % 2 === 0 ? 500 : 200,
          fingerprint,
          responseTimeMs: 50,
          bytesSent: 100,
          bytesReceived: 500,
        });
      }

      const result = await detector.analyze(fingerprint.hash);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('anomalous');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('getPatterns', () => {
    it('should return tracked patterns', async () => {
      const request = new Request('http://localhost/api/auth/login');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Trigger credential stuffing detection
      for (let i = 0; i < 10; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'POST',
          path: '/api/auth/login',
          statusCode: 401,
          fingerprint,
          responseTimeMs: 100,
          bytesSent: 200,
          bytesReceived: 500,
        });
      }

      await detector.analyze(fingerprint.hash);
      const patterns = detector.getPatterns(fingerprint.hash);
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].type).toBe('credential-stuffing');
    });
  });

  describe('clearPatterns', () => {
    it('should clear patterns for fingerprint', async () => {
      const request = new Request('http://localhost/api/auth/login');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      // Trigger detection
      for (let i = 0; i < 10; i++) {
        await detector.recordRequest({
          timestamp: now,
          method: 'POST',
          path: '/api/auth/login',
          statusCode: 401,
          fingerprint,
          responseTimeMs: 100,
          bytesSent: 200,
          bytesReceived: 500,
        });
      }

      await detector.analyze(fingerprint.hash);
      expect(detector.getPatterns(fingerprint.hash).length).toBeGreaterThan(0);

      // Clear patterns
      detector.clearPatterns(fingerprint.hash);
      expect(detector.getPatterns(fingerprint.hash).length).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up old data', async () => {
      const request = new Request('http://localhost/api/test');
      const fingerprint = AbuseDetector.getFingerprint(request);
      const now = Date.now();

      await detector.recordRequest({
        timestamp: now - 200000, // Old timestamp
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        fingerprint,
        responseTimeMs: 50,
        bytesSent: 100,
        bytesReceived: 1000,
      });

      detector.cleanup();
      
      const status = detector.getStatus();
      expect(status.localWindows).toBe(0);
    });
  });
});