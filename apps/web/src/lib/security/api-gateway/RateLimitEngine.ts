/**
 * API Gateway Hardening — Redis-backed Tiered Rate Limit Engine
 *
 * Provides distributed rate limiting with per-IP, per-user, per-API-key, and per-tenant
 * quotas with burst + sustained windows. Uses Redis for cross-instance synchronization.
 * Implements sliding window log algorithm for accurate counting under load.
 */

import { Redis } from '@upstash/redis';
import {
  RateLimitPolicy,
  TieredRateLimitConfig,
  RateLimitResponse,
  GatewayPolicies,
  DEFAULT_GATEWAY_POLICIES,
} from './policies';
import { getRedis, isRedisConfigured, resetRedisClient } from '@/lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IdentityTier = 'ip' | 'user' | 'apiKey' | 'tenant';

export interface IdentityContext {
  ip: string;
  userId?: string;
  apiKeyId?: string;
  tenantId?: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  tier: IdentityTier;
  policyName: string;
  remaining: number;
  resetAt: number;
  retryAfter: number;
  limit: number;
  used: number;
}

export interface RateLimitBucket {
  count: number;
  resetAt: number;
  windowMs: number;
}

// ─── Lua Scripts for Atomic Operations ────────────────────────────────────────

/**
 * Sliding window rate limit check (atomic)
 * Returns: [allowed (0/1), remaining, resetAt, currentCount]
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local windowStart = now - window

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count current requests in window
local current = redis.call('ZCARD', key)

if current + cost > limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = 0
  if #oldest > 0 then
    resetAt = tonumber(oldest[2]) + window
  else
    resetAt = now + window
  end
  return {0, math.max(limit - current, 0), resetAt, current}
end

-- Add new entries
for i = 1, cost do
  redis.call('ZADD', key, now, now .. ':' .. math.random())
end

-- Set expiry
redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)

local resetAt = now + window
return {1, limit - current - cost, resetAt, current + cost}
`;

/**
 * Fixed window rate limit check (atomic, faster for high throughput)
 * Returns: [allowed (0/1), remaining, resetAt, currentCount]
 */
const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local windowStart = now - (now % window)
local windowKey = key .. ':' .. windowStart

local current = tonumber(redis.call('GET', windowKey) or '0')

if current + cost > limit then
  local resetAt = windowStart + window
  return {0, math.max(limit - current, 0), resetAt, current}
end

local newCount = redis.call('INCRBY', windowKey, cost)
if newCount == cost then
  redis.call('EXPIRE', windowKey, math.ceil(window / 1000) + 1)
end

local resetAt = windowStart + window
return {1, limit - newCount, resetAt, newCount}
`;

/**
 * Token bucket algorithm for burst + sustained limiting
 * Returns: [allowed (0/1), remaining, resetAt, burstRemaining, sustainedRemaining]
 */
const TOKEN_BUCKET_SCRIPT = `
local burstKey = KEYS[1]
local sustainedKey = KEYS[2]
local now = tonumber(ARGV[1])
local burstWindow = tonumber(ARGV[2])
local burstLimit = tonumber(ARGV[3])
local sustainedWindow = tonumber(ARGV[4])
local sustainedLimit = tonumber(ARGV[5])
local cost = tonumber(ARGV[6])

-- Burst bucket (sliding window)
local burstWindowStart = now - burstWindow
redis.call('ZREMRANGEBYSCORE', burstKey, '-inf', burstWindowStart)
local burstCurrent = redis.call('ZCARD', burstKey)

-- Sustained bucket (fixed window)
local sustainedWindowStart = now - (now % sustainedWindow)
local sustainedWindowKey = sustainedKey .. ':' .. sustainedWindowStart
local sustainedCurrent = tonumber(redis.call('GET', sustainedWindowKey) or '0')

local burstAllowed = (burstCurrent + cost <= burstLimit)
local sustainedAllowed = (sustainedCurrent + cost <= sustainedLimit)

if not burstAllowed or not sustainedAllowed then
  local burstReset = now + burstWindow
  local sustainedReset = sustainedWindowStart + sustainedWindow
  local burstOldest = redis.call('ZRANGE', burstKey, 0, 0, 'WITHSCORES')
  if #burstOldest > 0 then
    burstReset = tonumber(burstOldest[2]) + burstWindow
  end
  return {
    0,
    math.max(burstLimit - burstCurrent, 0),
    math.min(burstReset, sustainedReset),
    math.max(burstLimit - burstCurrent, 0),
    math.max(sustainedLimit - sustainedCurrent, 0)
  }
end

-- Add to burst bucket
for i = 1, cost do
  redis.call('ZADD', burstKey, now, now .. ':' .. math.random())
end
redis.call('EXPIRE', burstKey, math.ceil(burstWindow / 1000) + 1)

-- Add to sustained bucket
local newSustained = redis.call('INCRBY', sustainedWindowKey, cost)
if newSustained == cost then
  redis.call('EXPIRE', sustainedWindowKey, math.ceil(sustainedWindow / 1000) + 1)
end

local burstReset = now + burstWindow
local sustainedReset = sustainedWindowStart + sustainedWindow
return {
  1,
  math.min(burstLimit - burstCurrent - cost, sustainedLimit - newSustained),
  math.min(burstReset, sustainedReset),
  burstLimit - burstCurrent - cost,
  sustainedLimit - newSustained
}
`;

// ─── RateLimitEngine Class ────────────────────────────────────────────────────

export class RateLimitEngine {
  private redis: Redis | null = null;
  private policies: Record<string, RateLimitPolicy>;
  private useRedis: boolean;
  private scriptSha: Map<string, string> = new Map();
  private localCache: Map<string, RateLimitBucket> = new Map();
  private cacheExpiry: Map<string, number> = new Map();

  constructor(policies?: GatewayPolicies) {
    this.policies = policies?.rateLimit ?? DEFAULT_GATEWAY_POLICIES.rateLimit;
    this.useRedis = isRedisConfigured();
    
    if (this.useRedis) {
      this.initRedis();
    }
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = getRedis();
      // Pre-load Lua scripts
      await this.loadScripts();
    } catch (error) {
      console.warn('[RateLimitEngine] Redis initialization failed, falling back to in-memory:', error);
      this.useRedis = false;
      this.redis = null;
    }
  }

  private async loadScripts(): Promise<void> {
    if (!this.redis) return;
    
    try {
      this.scriptSha.set('sliding', await this.redis.script('LOAD', SLIDING_WINDOW_SCRIPT) as string);
      this.scriptSha.set('fixed', await this.redis.script('LOAD', FIXED_WINDOW_SCRIPT) as string);
      this.scriptSha.set('tokenBucket', await this.redis.script('LOAD', TOKEN_BUCKET_SCRIPT) as string);
    } catch (error) {
      console.warn('[RateLimitEngine] Failed to load Lua scripts:', error);
    }
  }

  /**
   * Check rate limits for all applicable tiers
   * Returns the most restrictive result (first tier that denies)
   */
  async check(
    identity: IdentityContext,
    method: string,
    pathname: string,
    policyClass: string = 'default',
    cost: number = 1
  ): Promise<RateLimitCheckResult> {
    const policy = this.policies[policyClass] ?? this.policies.default;
    const now = Date.now();

    // Check tiers in order of specificity: IP -> User -> API Key -> Tenant
    const tiers: Array<{ tier: IdentityTier; config: TieredRateLimitConfig; key: string }> = [
      { tier: 'ip', config: policy.ip, key: `ip:${identity.ip}` },
    ];

    if (identity.userId) {
      tiers.push({ tier: 'user', config: policy.user, key: `user:${identity.userId}` });
    }
    if (identity.apiKeyId) {
      tiers.push({ tier: 'apiKey', config: policy.apiKey, key: `apikey:${identity.apiKeyId}` });
    }
    if (identity.tenantId) {
      tiers.push({ tier: 'tenant', config: policy.tenant, key: `tenant:${identity.tenantId}` });
    }

    // Apply endpoint cost multiplier
    const endpointCost = policy.endpointCosts?.[pathname] ?? 1;
    const totalCost = cost * endpointCost;

    for (const { tier, config, key } of tiers) {
      const result = await this.checkTier(key, config, totalCost, now, tier, policyClass);
      if (!result.allowed) {
        return result;
      }
    }

    // All tiers allowed - return the most restrictive remaining
    const mostRestrictive = tiers.reduce((min, { tier, config, key }) => {
      const fullKey = `ratelimit:${policyClass}:${key}`;
      const cached = this.localCache.get(fullKey);
      const remaining = cached ? Math.max(config.burstLimit - cached.count, 0) : config.burstLimit;
      return remaining < min.remaining ? { tier, remaining, resetAt: cached?.resetAt ?? (now + config.burstWindowMs) } : min;
    }, { tier: 'ip' as IdentityTier, remaining: Infinity, resetAt: now });

    return {
      allowed: true,
      tier: mostRestrictive.tier,
      policyName: policyClass,
      remaining: mostRestrictive.remaining,
      resetAt: mostRestrictive.resetAt,
      retryAfter: Math.max(Math.ceil((mostRestrictive.resetAt - now) / 1000), 1),
      limit: policy.ip.burstLimit, // Use IP tier as baseline for headers
      used: policy.ip.burstLimit - mostRestrictive.remaining,
    };
  }

  /**
   * Check a single tier using token bucket (burst + sustained)
   */
  private async checkTier(
    key: string,
    config: TieredRateLimitConfig,
    cost: number,
    now: number,
    tier: IdentityTier,
    policyName: string
  ): Promise<RateLimitCheckResult> {
    const fullKey = `ratelimit:${policyName}:${key}`;

    if (this.useRedis && this.redis) {
      return this.checkTierRedis(fullKey, config, cost, now, tier, policyName);
    } else {
      return this.checkTierLocal(fullKey, config, cost, now, tier, policyName);
    }
  }

  /**
   * Redis-backed tier check using token bucket algorithm
   */
  private async checkTierRedis(
    key: string,
    config: TieredRateLimitConfig,
    cost: number,
    now: number,
    tier: IdentityTier,
    policyName: string
  ): Promise<RateLimitCheckResult> {
    if (!this.redis) {
      return this.checkTierLocal(key, config, cost, now, tier, policyName);
    }

    const burstKey = `${key}:burst`;
    const sustainedKey = `${key}:sustained`;

    try {
      const sha = this.scriptSha.get('tokenBucket');
      let result: unknown[];

      if (sha) {
        try {
          result = await this.redis.evalsha(
            sha,
            2,
            burstKey,
            sustainedKey,
            now,
            config.burstWindowMs,
            config.burstLimit,
            config.sustainedWindowMs,
            config.sustainedLimit,
            cost
          ) as unknown[];
        } catch (evalError) {
          // Script may have been flushed, reload and retry
          await this.loadScripts();
          const newSha = this.scriptSha.get('tokenBucket');
          if (newSha) {
            result = await this.redis.evalsha(
              newSha,
              2,
              burstKey,
              sustainedKey,
              now,
              config.burstWindowMs,
              config.burstLimit,
              config.sustainedWindowMs,
              config.sustainedLimit,
              cost
            ) as unknown[];
          } else {
            throw evalError;
          }
        }
      } else {
        result = await this.redis.eval(
          TOKEN_BUCKET_SCRIPT,
          2,
          burstKey,
          sustainedKey,
          now,
          config.burstWindowMs,
          config.burstLimit,
          config.sustainedWindowMs,
          config.sustainedLimit,
          cost
        ) as unknown[];
      }

      const [allowed, remaining, resetAt, burstRemaining, sustainedRemaining] = result as [
        number,
        number,
        number,
        number,
        number
      ];

      return {
        allowed: allowed === 1,
        tier,
        policyName,
        remaining: Math.min(burstRemaining, sustainedRemaining),
        resetAt,
        retryAfter: Math.max(Math.ceil((resetAt - now) / 1000), 1),
        limit: config.burstLimit,
        used: config.burstLimit - Math.min(burstRemaining, sustainedRemaining),
      };
    } catch (error) {
      console.error(`[RateLimitEngine] Redis error for ${key}:`, error);
      // Fail-open or fail-closed based on policy
      if (config.failClosed) {
        return {
          allowed: false,
          tier,
          policyName,
          remaining: 0,
          resetAt: now + config.burstWindowMs,
          retryAfter: Math.ceil(config.burstWindowMs / 1000),
          limit: config.burstLimit,
          used: config.burstLimit,
        };
      }
      // Fail-open: allow but log warning
      return this.checkTierLocal(key, config, cost, now, tier, policyName);
    }
  }

  /**
   * In-memory tier check (fallback when Redis unavailable)
   * Uses sliding window log approximation
   */
  private checkTierLocal(
    key: string,
    config: TieredRateLimitConfig,
    cost: number,
    now: number,
    tier: IdentityTier,
    policyName: string
  ): RateLimitCheckResult {
    const bucket = this.localCache.get(key);
    const windowStart = now - config.burstWindowMs;

    if (bucket && bucket.resetAt > now) {
      // Within current window
      if (bucket.count + cost <= config.burstLimit) {
        bucket.count += cost;
        this.localCache.set(key, bucket);
        return {
          allowed: true,
          tier,
          policyName,
          remaining: config.burstLimit - bucket.count,
          resetAt: bucket.resetAt,
          retryAfter: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
          limit: config.burstLimit,
          used: bucket.count,
        };
      } else {
        // Exceeded burst limit
        return {
          allowed: false,
          tier,
          policyName,
          remaining: 0,
          resetAt: bucket.resetAt,
          retryAfter: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
          limit: config.burstLimit,
          used: bucket.count,
        };
      }
    }

    // New or expired window
    const newBucket: RateLimitBucket = {
      count: cost,
      resetAt: now + config.burstWindowMs,
      windowMs: config.burstWindowMs,
    };
    this.localCache.set(key, newBucket);

    // Cleanup old entries periodically
    this.cleanupLocalCache(now);

    return {
      allowed: true,
      tier,
      policyName,
      remaining: config.burstLimit - cost,
      resetAt: newBucket.resetAt,
      retryAfter: Math.ceil(config.burstWindowMs / 1000),
      limit: config.burstLimit,
      used: cost,
    };
  }

  private cleanupLocalCache(now: number): void {
    if (this.localCache.size > 10000) {
      for (const [key, bucket] of this.localCache.entries()) {
        if (bucket.resetAt <= now) {
          this.localCache.delete(key);
        }
      }
    }
  }

  /**
   * Build standardized rate limit response headers
   */
  buildHeaders(result: RateLimitCheckResult): Record<string, string> {
    const resetSeconds = Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 0);
    
    return {
      'RateLimit-Limit': String(result.limit),
      'RateLimit-Remaining': String(Math.max(result.remaining, 0)),
      'RateLimit-Reset': String(resetSeconds),
      'Retry-After': String(result.retryAfter),
      'X-RateLimit-Policy': result.policyName,
      'X-RateLimit-Tier': result.tier,
    };
  }

  /**
   * Build standardized 429 response
   */
  build429Response(result: RateLimitCheckResult): RateLimitResponse {
    return {
      allowed: false,
      status: 429,
      retryAfter: result.retryAfter,
      headers: this.buildHeaders(result),
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded for ${result.tier}. Try again in ${result.retryAfter} seconds.`,
      quota: undefined,
    };
  }

  /**
   * Get current usage statistics for a key (for dashboards)
   */
  async getUsage(
    identity: IdentityContext,
    policyClass: string = 'default'
  ): Promise<Record<IdentityTier, { used: number; limit: number; remaining: number; resetAt: number }>> {
    const policy = this.policies[policyClass] ?? this.policies.default;
    const now = Date.now();
    const usage: Record<string, any> = {};

    const tiers: Array<{ tier: IdentityTier; config: TieredRateLimitConfig; key: string }> = [
      { tier: 'ip', config: policy.ip, key: `ip:${identity.ip}` },
    ];

    if (identity.userId) tiers.push({ tier: 'user', config: policy.user, key: `user:${identity.userId}` });
    if (identity.apiKeyId) tiers.push({ tier: 'apiKey', config: policy.apiKey, key: `apikey:${identity.apiKeyId}` });
    if (identity.tenantId) tiers.push({ tier: 'tenant', config: policy.tenant, key: `tenant:${identity.tenantId}` });

    for (const { tier, config, key } of tiers) {
      const fullKey = `ratelimit:${policyClass}:${key}`;
      
      if (this.useRedis && this.redis) {
        try {
          const burstKey = `${fullKey}:burst`;
          const sustainedKey = `${fullKey}:sustained`;
          
          const burstCount = await this.redis.zcount(burstKey, now - config.burstWindowMs, '+inf');
          const sustainedWindowStart = now - (now % config.sustainedWindowMs);
          const sustainedCount = parseInt((await this.redis.get(`${sustainedKey}:${sustainedWindowStart}`)) as string || '0', 10);
          
          usage[tier] = {
            used: Math.max(burstCount, sustainedCount),
            limit: config.burstLimit,
            remaining: Math.max(config.burstLimit - Math.max(burstCount, sustainedCount), 0),
            resetAt: now + config.burstWindowMs,
          };
        } catch {
          usage[tier] = { used: 0, limit: config.burstLimit, remaining: config.burstLimit, resetAt: now + config.burstWindowMs };
        }
      } else {
        const bucket = this.localCache.get(fullKey);
        usage[tier] = {
          used: bucket?.count ?? 0,
          limit: config.burstLimit,
          remaining: bucket ? Math.max(config.burstLimit - bucket.count, 0) : config.burstLimit,
          resetAt: bucket?.resetAt ?? (now + config.burstWindowMs),
        };
      }
    }

    return usage as Record<IdentityTier, any>;
  }

  /**
   * Reset rate limit for a specific identity (admin operation)
   */
  async reset(identity: IdentityContext, policyClass: string = 'default'): Promise<void> {
    const policy = this.policies[policyClass] ?? this.policies.default;

    const keys: string[] = [
      `ratelimit:${policyClass}:ip:${identity.ip}`,
    ];

    if (identity.userId) keys.push(`ratelimit:${policyClass}:user:${identity.userId}`);
    if (identity.apiKeyId) keys.push(`ratelimit:${policyClass}:apikey:${identity.apiKeyId}`);
    if (identity.tenantId) keys.push(`ratelimit:${policyClass}:tenant:${identity.tenantId}`);

    if (this.useRedis && this.redis) {
      for (const key of keys) {
        await this.redis.del(key, `${key}:burst`, `${key}:sustained`);
      }
    } else {
      for (const key of keys) {
        this.localCache.delete(key);
        this.localCache.delete(`${key}:burst`);
        this.localCache.delete(`${key}:sustained`);
      }
    }
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.useRedis && this.redis !== null;
  }

  /**
   * Get engine status for health checks
   */
  getStatus(): { redis: boolean; localCacheSize: number; policies: string[] } {
    return {
      redis: this.isRedisAvailable(),
      localCacheSize: this.localCache.size,
      policies: Object.keys(this.policies),
    };
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let engineInstance: RateLimitEngine | null = null;

export function getRateLimitEngine(policies?: GatewayPolicies): RateLimitEngine {
  if (!engineInstance) {
    engineInstance = new RateLimitEngine(policies);
  }
  return engineInstance;
}

export function resetRateLimitEngine(): void {
  engineInstance = null;
  resetRedisClient();
}