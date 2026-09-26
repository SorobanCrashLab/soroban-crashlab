import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export interface ResilientRedisConfig {
  commandTimeoutMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTimeoutMs: number;
}

const DEFAULT_CONFIG: ResilientRedisConfig = {
  commandTimeoutMs: 5000,
  maxRetries: 3,
  baseRetryDelayMs: 100,
  maxRetryDelayMs: 2000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetTimeoutMs: 30000,
};

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

let circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: 'closed',
};

function checkCircuitBreaker(config: ResilientRedisConfig): void {
  const now = Date.now();
  if (circuitBreaker.state === 'open') {
    if (now - circuitBreaker.lastFailure > config.circuitBreakerResetTimeoutMs) {
      circuitBreaker.state = 'half-open';
    } else {
      throw new Error('Circuit breaker is open');
    }
  }
}

function recordSuccess(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'closed';
}

function recordFailure(config: ResilientRedisConfig): void {
  circuitBreaker.failures += 1;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= config.circuitBreakerThreshold) {
    circuitBreaker.state = 'open';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createResilientRedis(config: ResilientRedisConfig = DEFAULT_CONFIG): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Redis not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in your Vercel environment.',
    );
  }

  const baseClient = new Redis({ url, token });

  return new Proxy(baseClient, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      return async (...args: unknown[]) => {
        checkCircuitBreaker(config);

        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.commandTimeoutMs);

            const result = await original.apply(target, args);

            clearTimeout(timeoutId);
            recordSuccess();
            return result;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < config.maxRetries) {
              const delay = Math.min(
                config.baseRetryDelayMs * Math.pow(2, attempt) + Math.random() * 100,
                config.maxRetryDelayMs,
              );
              await sleep(delay);
            }
          }
        }

        recordFailure(config);
        throw lastError;
      };
    },
  });
}

export function getRedis(config?: Partial<ResilientRedisConfig>): Redis {
  if (client) return client;

  client = createResilientRedis({ ...DEFAULT_CONFIG, ...config });
  return client;
}

export function resetRedisClient(): void {
  client = null;
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function getCircuitBreakerState(): CircuitBreakerState {
  return { ...circuitBreaker };
}

export function resetCircuitBreaker(): void {
  circuitBreaker = { failures: 0, lastFailure: 0, state: 'closed' };
}