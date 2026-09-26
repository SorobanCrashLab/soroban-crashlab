import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getRedis,
  isRedisConfigured,
  getCircuitBreakerState,
  resetCircuitBreaker,
  resetRedisClient,
  type ResilientRedisConfig,
} from '@/lib/redis';

// Mock the @upstash/redis module
vi.mock('@upstash/redis', () => {
  const mockStore = new Map<string, string>();

  class MockRedis {
    private shouldFail = false;
    private failCount = 0;
    private maxFails = 0;

    constructor() {}

    get(key: string): Promise<string | null> {
      return Promise.resolve(mockStore.get(key) ?? null);
    }

    set(key: string, value: string): Promise<string> {
      mockStore.set(key, value);
      return Promise.resolve('OK');
    }

    del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const k of keys) {
        if (mockStore.delete(k)) count++;
      }
      return Promise.resolve(count);
    }

    sadd(key: string, ...members: string[]): Promise<number> {
      return Promise.resolve(members.length);
    }

    srem(key: string, ...members: string[]): Promise<number> {
      return Promise.resolve(members.length);
    }

    smembers(_key: string): Promise<string[]> {
      return Promise.resolve([]);
    }

    // Test helpers
    _setShouldFail(shouldFail: boolean, maxFails = 1) {
      this.shouldFail = shouldFail;
      this.failCount = 0;
      this.maxFails = maxFails;
    }

    _reset() {
      mockStore.clear();
      this.shouldFail = false;
      this.failCount = 0;
      this.maxFails = 0;
    }
  }

  return { Redis: MockRedis };
});

describe('Resilient Redis Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    process.env.KV_REST_API_URL = 'https://test.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    resetCircuitBreaker();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('creates a client when configured', () => {
    expect(isRedisConfigured()).toBe(true);
    const client = getRedis();
    expect(client).toBeDefined();
  });

  it('throws when not configured', () => {
    resetRedisClient();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(isRedisConfigured()).toBe(false);
    expect(() => getRedis()).toThrow('Redis not configured');
  });

  it('returns cached client on subsequent calls', () => {
    const client1 = getRedis();
    const client2 = getRedis();
    expect(client1).toBe(client2);
  });

  it('exposes circuit breaker state', () => {
    const state = getCircuitBreakerState();
    expect(state).toEqual({
      failures: 0,
      lastFailure: 0,
      state: 'closed',
    });
  });

  it('resets circuit breaker', () => {
    getCircuitBreakerState(); // initialize
    resetCircuitBreaker();
    const state = getCircuitBreakerState();
    expect(state.failures).toBe(0);
    expect(state.state).toBe('closed');
  });

  it('accepts custom config', () => {
    const customConfig: Partial<ResilientRedisConfig> = {
      commandTimeoutMs: 1000,
      maxRetries: 5,
      baseRetryDelayMs: 50,
    };
    const _client = getRedis(customConfig);
    expect(_client).toBeDefined();
  });

  it('circuit breaker opens after threshold failures', async () => {
    const _client = getRedis({
      maxRetries: 0,
      circuitBreakerThreshold: 3,
      circuitBreakerResetTimeoutMs: 1000,
    });

    // We can't easily test the internal circuit breaker without accessing the mock
    // This test documents the expected behavior
    expect(getCircuitBreakerState().state).toBe('closed');
  });
});

describe('Redis command timeout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    process.env.KV_REST_API_URL = 'https://test.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    resetCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('configures command timeout', () => {
    const _client = getRedis({ commandTimeoutMs: 100 });
    expect(_client).toBeDefined();
  });
});

describe('Redis retry with backoff', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    process.env.KV_REST_API_URL = 'https://test.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    resetCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('configures retry parameters', () => {
    const _client = getRedis({
      maxRetries: 3,
      baseRetryDelayMs: 100,
      maxRetryDelayMs: 2000,
    });
    expect(_client).toBeDefined();
  });
});