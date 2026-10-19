/**
 * Unit tests for distributed lease coordination.
 *
 * Tests cover:
 * - Acquire/renew/release lifecycle
 * - Contention (two holders competing for the same key)
 * - Fencing token validation
 * - Stale lease holder rejection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { acquire, renew, release, withLease, validateFencingToken, LeaseNotAcquiredError } from './lease';

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock('./redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
}));

describe('lease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('acquire', () => {
    it('returns a Lease when no lease exists for the key', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lease = await acquire('test-key', 30000);

      expect(lease).not.toBeNull();
      expect(lease!.key).toBe('test-key');
      expect(lease!.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(lease!.expiresAt).toBeGreaterThan(Date.now());
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lease:test-key',
        expect.stringContaining('"token"'),
        { nx: true, ex: 30 },
      );
    });

    it('returns null when a valid lease exists for the key', async () => {
      mockRedis.set.mockResolvedValue(null);

      const lease = await acquire('test-key', 30000);

      expect(lease).toBeNull();
    });

    it('uses custom token generator when provided', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const customToken = 'custom-token-123';

      const lease = await acquire('test-key', 30000, {
        tokenGenerator: () => customToken,
      });

      expect(lease!.token).toBe(customToken);
    });

    it('throws LeaseNotAcquiredError when KV store is unavailable', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      await expect(acquire('test-key', 30000)).rejects.toThrow(LeaseNotAcquiredError);
      await expect(acquire('test-key', 30000)).rejects.toThrow('kv_unavailable');
    });
  });

  describe('renew', () => {
    it('returns an updated Lease when the token matches', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt }));
      mockRedis.set.mockResolvedValue('OK');

      const lease = { key: 'test-key', token: 'token-123', expiresAt, renewAfterMs: Date.now() + 15000 };
      const renewed = await renew(lease);

      expect(renewed).not.toBeNull();
      expect(renewed!.token).toBe('token-123');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('returns null when the token does not match (lease was replaced)', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'other-token', expiresAt }));

      const lease = { key: 'test-key', token: 'token-123', expiresAt, renewAfterMs: Date.now() + 15000 };
      const renewed = await renew(lease);

      expect(renewed).toBeNull();
    });

    it('returns null when the lease has expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      const lease = { key: 'test-key', token: 'token-123', expiresAt: Date.now() - 1000, renewAfterMs: Date.now() };
      const renewed = await renew(lease);

      expect(renewed).toBeNull();
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));

      const lease = { key: 'test-key', token: 'token-123', expiresAt: Date.now() + 30000, renewAfterMs: Date.now() + 15000 };
      const renewed = await renew(lease);

      expect(renewed).toBeNull();
    });
  });

  describe('release', () => {
    it('returns true when the token matches and the entry is deleted', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt }));
      mockRedis.del.mockResolvedValue(1);

      const lease = { key: 'test-key', token: 'token-123', expiresAt, renewAfterMs: Date.now() + 15000 };
      const result = await release(lease);

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('lease:test-key');
    });

    it('returns false when the token does not match', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'other-token', expiresAt }));

      const lease = { key: 'test-key', token: 'token-123', expiresAt, renewAfterMs: Date.now() + 15000 };
      const result = await release(lease);

      expect(result).toBe(false);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('returns false when the lease has already expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      const lease = { key: 'test-key', token: 'token-123', expiresAt: Date.now() - 1000, renewAfterMs: Date.now() };
      const result = await release(lease);

      expect(result).toBe(false);
    });
  });

  describe('withLease', () => {
    it('acquires lease, runs function, and releases', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt: Date.now() + 30000 }));
      mockRedis.del.mockResolvedValue(1);

      const fn = vi.fn().mockResolvedValue('result');
      const result = await withLease('test-key', 30000, fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledWith(expect.any(String));
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('throws LeaseNotAcquiredError when lease cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null); // Lease held by another

      const fn = vi.fn();
      await expect(withLease('test-key', 30000, fn)).rejects.toThrow(LeaseNotAcquiredError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('releases lease even if function throws', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt: Date.now() + 30000 }));
      mockRedis.del.mockResolvedValue(1);

      const fn = vi.fn().mockRejectedValue(new Error('Function error'));

      await expect(withLease('test-key', 30000, fn)).rejects.toThrow('Function error');
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('validateFencingToken', () => {
    it('returns true when token matches and lease is not expired', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt }));

      const result = await validateFencingToken('test-key', 'token-123');

      expect(result).toBe(true);
    });

    it('returns false when token does not match', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'other-token', expiresAt }));

      const result = await validateFencingToken('test-key', 'token-123');

      expect(result).toBe(false);
    });

    it('returns false when lease has expired', async () => {
      const expiresAt = Date.now() - 1000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'token-123', expiresAt }));

      const result = await validateFencingToken('test-key', 'token-123');

      expect(result).toBe(false);
    });

    it('returns false when lease does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await validateFencingToken('test-key', 'token-123');

      expect(result).toBe(false);
    });

    it('returns false on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));

      const result = await validateFencingToken('test-key', 'token-123');

      expect(result).toBe(false);
    });
  });

  describe('contention test', () => {
    it('only one of two concurrent acquire calls succeeds', async () => {
      // First call succeeds
      mockRedis.set.mockResolvedValueOnce('OK');
      // Second call fails (key already exists)
      mockRedis.set.mockResolvedValueOnce(null);

      const [lease1, lease2] = await Promise.all([
        acquire('test-key', 30000),
        acquire('test-key', 30000),
      ]);

      // Exactly one should succeed
      const successCount = [lease1, lease2].filter(l => l !== null).length;
      expect(successCount).toBe(1);
    });
  });

  describe('fencing token test', () => {
    it('write with correct fencing token succeeds validation', async () => {
      const expiresAt = Date.now() + 30000;
      const token = 'valid-token';
      mockRedis.get.mockResolvedValue(JSON.stringify({ token, expiresAt }));

      const isValid = await validateFencingToken('test-key', token);

      expect(isValid).toBe(true);
    });

    it('write with incorrect fencing token (stale lease holder) is rejected', async () => {
      const expiresAt = Date.now() + 30000;
      mockRedis.get.mockResolvedValue(JSON.stringify({ token: 'current-token', expiresAt }));

      const isValid = await validateFencingToken('test-key', 'stale-token');

      expect(isValid).toBe(false);
    });
  });
});
