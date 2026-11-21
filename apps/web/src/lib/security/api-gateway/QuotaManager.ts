/**
 * API Gateway Hardening — Quota Manager
 *
 * Manages per-tenant quotas with:
 * - Multiple quota tiers (free, standard, premium, enterprise)
 * - Request and bandwidth quotas
 * - Concurrent request limiting
 * - Quota borrowing between periods
 * - Grace periods
 * - Usage dashboard data
 */

import { Redis } from '@upstash/redis';
import {
  QuotaConfig,
  QuotaTier,
  QuotaConfigSchema,
  DEFAULT_QUOTA_CONFIG,
  GatewayPolicies,
  DEFAULT_GATEWAY_POLICIES,
} from './policies';
import { getRedis, isRedisConfigured, resetRedisClient } from '@/lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantQuota {
  tenantId: string;
  tier: string;
  tierConfig: QuotaTier;
  periodStart: number;
  periodEnd: number;
  requestsUsed: number;
  bandwidthUsed: number;
  concurrentRequests: number;
  borrowed: number;
  gracePeriodEnd?: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  tenantId: string;
  tier: string;
  requests: {
    used: number;
    limit: number;
    remaining: number;
  };
  bandwidth: {
    used: number;
    limit: number;
    remaining: number;
  };
  concurrent: {
    used: number;
    limit: number;
    remaining: number;
  };
  resetAt: number;
  gracePeriod: boolean;
  retryAfter?: number;
}

export interface QuotaUsage {
  tenantId: string;
  tier: string;
  periodStart: number;
  periodEnd: number;
  requests: { used: number; limit: number; percent: number };
  bandwidth: { used: number; limit: number; percent: number };
  concurrent: { used: number; limit: number; percent: number };
  history: QuotaHistoryPoint[];
}

export interface QuotaHistoryPoint {
  timestamp: number;
  requests: number;
  bandwidth: number;
}

export interface QuotaDashboardData {
  tenants: QuotaUsage[];
  totals: {
    totalRequests: number;
    totalBandwidth: number;
    activeTenants: number;
    throttledTenants: number;
  };
}

// ─── Lua Scripts ──────────────────────────────────────────────────────────────

const QUOTA_CHECK_SCRIPT = `
local quotaKey = KEYS[1]
local bandwidthKey = KEYS[2]
local concurrentKey = KEYS[3]
local now = tonumber(ARGV[1])
local periodEnd = tonumber(ARGV[2])
local requestLimit = tonumber(ARGV[3])
local bandwidthLimit = tonumber(ARGV[4])
local concurrentLimit = tonumber(ARGV[5])
local requestCost = tonumber(ARGV[6])
local bandwidthCost = tonumber(ARGV[7])

-- Check concurrent
local currentConcurrent = tonumber(redis.call('GET', concurrentKey) or '0')
if currentConcurrent >= concurrentLimit then
  return {0, 'concurrent', currentConcurrent, concurrentLimit}
end

-- Check request quota
local currentRequests = tonumber(redis.call('GET', quotaKey) or '0')
if currentRequests + requestCost > requestLimit then
  return {0, 'requests', currentRequests, requestLimit}
end

-- Check bandwidth quota
local currentBandwidth = tonumber(redis.call('GET', bandwidthKey) or '0')
if currentBandwidth + bandwidthCost > bandwidthLimit then
  return {0, 'bandwidth', currentBandwidth, bandwidthLimit}
end

-- All checks passed, increment counters
redis.call('INCRBY', quotaKey, requestCost)
redis.call('INCRBY', bandwidthKey, bandwidthCost)
redis.call('INCR', concurrentKey)

-- Set expiry if new keys
local ttl = math.ceil((periodEnd - now) / 1000) + 1
redis.call('EXPIRE', quotaKey, ttl)
redis.call('EXPIRE', bandwidthKey, ttl)
redis.call('EXPIRE', concurrentKey, ttl)

return {1, currentRequests + requestCost, requestLimit, currentBandwidth + bandwidthCost, bandwidthLimit, currentConcurrent + 1, concurrentLimit}
`;

const QUOTA_RELEASE_CONCURRENT_SCRIPT = `
local concurrentKey = KEYS[1]
local current = redis.call('DECR', concurrentKey)
if current < 0 then
  redis.call('SET', concurrentKey, 0)
  current = 0
end
return current
`;

// ─── QuotaManager Class ───────────────────────────────────────────────────────

export class QuotaManager {
  private redis: Redis | null = null;
  private config: QuotaConfig;
  private useRedis: boolean;
  private localQuotas: Map<string, TenantQuota> = new Map();
  private scriptSha: string | null = null;
  private releaseScriptSha: string | null = null;

  constructor(config?: Partial<QuotaConfig>) {
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config };
    this.useRedis = isRedisConfigured();
    
    if (this.useRedis) {
      this.initRedis();
    }
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = getRedis();
      this.scriptSha = await this.redis.script('LOAD', QUOTA_CHECK_SCRIPT) as string;
      this.releaseScriptSha = await this.redis.script('LOAD', QUOTA_RELEASE_CONCURRENT_SCRIPT) as string;
    } catch (error) {
      console.warn('[QuotaManager] Redis initialization failed, falling back to in-memory:', error);
      this.useRedis = false;
      this.redis = null;
    }
  }

  /**
   * Get or create tenant quota
   */
  private getOrCreateQuota(tenantId: string): TenantQuota {
    const now = Date.now();
    let quota = this.localQuotas.get(tenantId);

    if (!quota || quota.periodEnd <= now) {
      // Create new quota period
      const tierName = this.config.defaultTier;
      const tierConfig = this.config.tiers[tierName] ?? this.config.tiers.standard;
      
      const periodStart = this.calculatePeriodStart(now);
      const periodEnd = this.calculatePeriodEnd(periodStart);

      quota = {
        tenantId,
        tier: tierName,
        tierConfig,
        periodStart,
        periodEnd,
        requestsUsed: 0,
        bandwidthUsed: 0,
        concurrentRequests: 0,
        borrowed: 0,
      };
      this.localQuotas.set(tenantId, quota);
    }

    return quota;
  }

  /**
   * Calculate period start based on reset schedule (simplified to daily)
   */
  private calculatePeriodStart(now: number): number {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Calculate period end
   */
  private calculatePeriodEnd(periodStart: number): number {
    return periodStart + 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get effective limits considering borrowing
   */
  private getEffectiveLimits(quota: TenantQuota): { requests: number; bandwidth: number } {
    const limits = {
      requests: quota.tierConfig.requests,
      bandwidth: quota.tierConfig.bandwidthBytes,
    };

    if (this.config.allowBorrowing && quota.gracePeriodEnd && quota.gracePeriodEnd > Date.now()) {
      const borrowAmount = Math.floor(limits.requests * this.config.borrowLimit);
      limits.requests += borrowAmount;
      limits.bandwidth += Math.floor(limits.bandwidth * this.config.borrowLimit);
    }

    return limits;
  }

  /**
   * Check quota for a request
   */
  async checkQuota(
    tenantId: string,
    requestCost: number = 1,
    bandwidthCost: number = 0
  ): Promise<QuotaCheckResult> {
    if (this.useRedis && this.redis) {
      return this.checkQuotaRedis(tenantId, requestCost, bandwidthCost);
    } else {
      return this.checkQuotaLocal(tenantId, requestCost, bandwidthCost);
    }
  }

  /**
   * Redis-backed quota check
   */
  private async checkQuotaRedis(
    tenantId: string,
    requestCost: number,
    bandwidthCost: number
  ): Promise<QuotaCheckResult> {
    if (!this.redis) {
      return this.checkQuotaLocal(tenantId, requestCost, bandwidthCost);
    }

    const now = Date.now();
    const tierConfig = this.config.tiers[this.config.defaultTier] ?? this.config.tiers.standard;
    const periodStart = this.calculatePeriodStart(now);
    const periodEnd = this.calculatePeriodEnd(periodStart);

    const quotaKey = `quota:${tenantId}:requests:${periodStart}`;
    const bandwidthKey = `quota:${tenantId}:bandwidth:${periodStart}`;
    const concurrentKey = `quota:${tenantId}:concurrent`;

    try {
      let result: unknown[];
      
      if (this.scriptSha) {
        try {
          result = await this.redis.evalsha(
            this.scriptSha,
            3,
            quotaKey,
            bandwidthKey,
            concurrentKey,
            now,
            periodEnd,
            tierConfig.requests,
            tierConfig.bandwidthBytes,
            tierConfig.concurrent,
            requestCost,
            bandwidthCost
          ) as unknown[];
        } catch (evalError) {
          // Reload script and retry
          this.scriptSha = await this.redis.script('LOAD', QUOTA_CHECK_SCRIPT) as string;
          result = await this.redis.evalsha(
            this.scriptSha,
            3,
            quotaKey,
            bandwidthKey,
            concurrentKey,
            now,
            periodEnd,
            tierConfig.requests,
            tierConfig.bandwidthBytes,
            tierConfig.concurrent,
            requestCost,
            bandwidthCost
          ) as unknown[];
        }
      } else {
        result = await this.redis.eval(
          QUOTA_CHECK_SCRIPT,
          3,
          quotaKey,
          bandwidthKey,
          concurrentKey,
          now,
          periodEnd,
          tierConfig.requests,
          tierConfig.bandwidthBytes,
          tierConfig.concurrent,
          requestCost,
          bandwidthCost
        ) as unknown[];
      }

      const [allowed, ...rest] = result as [number, ...unknown[]];

      if (allowed === 0) {
        const [reason, used, limit] = rest as [string, number, number];
        return {
          allowed: false,
          tenantId,
          tier: this.config.defaultTier,
          requests: { used, limit, remaining: 0 },
          bandwidth: { used: 0, limit: tierConfig.bandwidthBytes, remaining: tierConfig.bandwidthBytes },
          concurrent: { used: 0, limit: tierConfig.concurrent, remaining: tierConfig.concurrent },
          resetAt: periodEnd,
          gracePeriod: false,
          retryAfter: Math.ceil((periodEnd - now) / 1000),
        };
      }

      const [requestsUsed, requestsLimit, bandwidthUsed, bandwidthLimit, concurrentUsed, concurrentLimit] = rest as number[];

      return {
        allowed: true,
        tenantId,
        tier: this.config.defaultTier,
        requests: {
          used: requestsUsed,
          limit: requestsLimit,
          remaining: Math.max(requestsLimit - requestsUsed, 0),
        },
        bandwidth: {
          used: bandwidthUsed,
          limit: bandwidthLimit,
          remaining: Math.max(bandwidthLimit - bandwidthUsed, 0),
        },
        concurrent: {
          used: concurrentUsed,
          limit: concurrentLimit,
          remaining: Math.max(concurrentLimit - concurrentUsed, 0),
        },
        resetAt: periodEnd,
        gracePeriod: false,
      };
    } catch (error) {
      console.error('[QuotaManager] Redis error:', error);
      return this.checkQuotaLocal(tenantId, requestCost, bandwidthCost);
    }
  }

  /**
   * In-memory quota check
   */
  private checkQuotaLocal(
    tenantId: string,
    requestCost: number,
    bandwidthCost: number
  ): QuotaCheckResult {
    const now = Date.now();
    const quota = this.getOrCreateQuota(tenantId);
    const limits = this.getEffectiveLimits(quota);

    // Check concurrent
    if (quota.concurrentRequests >= quota.tierConfig.concurrent) {
      return {
        allowed: false,
        tenantId,
        tier: quota.tier,
        requests: { used: quota.requestsUsed, limit: limits.requests, remaining: 0 },
        bandwidth: { used: quota.bandwidthUsed, limit: limits.bandwidth, remaining: limits.bandwidth },
        concurrent: { used: quota.concurrentRequests, limit: quota.tierConfig.concurrent, remaining: 0 },
        resetAt: quota.periodEnd,
        gracePeriod: !!quota.gracePeriodEnd && quota.gracePeriodEnd > now,
        retryAfter: Math.ceil((quota.periodEnd - now) / 1000),
      };
    }

    // Check request quota
    if (quota.requestsUsed + requestCost > limits.requests) {
      // Check grace period
      if (this.config.gracePeriodMs > 0 && !quota.gracePeriodEnd) {
        quota.gracePeriodEnd = now + this.config.gracePeriodMs;
      }
      
      if (quota.gracePeriodEnd && quota.gracePeriodEnd > now) {
        // Allow in grace period but track borrowing
        quota.borrowed += requestCost;
      } else {
        return {
          allowed: false,
          tenantId,
          tier: quota.tier,
          requests: { used: quota.requestsUsed, limit: limits.requests, remaining: 0 },
          bandwidth: { used: quota.bandwidthUsed, limit: limits.bandwidth, remaining: limits.bandwidth },
          concurrent: { used: quota.concurrentRequests, limit: quota.tierConfig.concurrent, remaining: quota.tierConfig.concurrent - quota.concurrentRequests },
          resetAt: quota.periodEnd,
          gracePeriod: !!quota.gracePeriodEnd && quota.gracePeriodEnd > now,
          retryAfter: Math.ceil((quota.periodEnd - now) / 1000),
        };
      }
    }

    // Check bandwidth quota
    if (quota.bandwidthUsed + bandwidthCost > limits.bandwidth) {
      return {
        allowed: false,
        tenantId,
        tier: quota.tier,
        requests: { used: quota.requestsUsed, limit: limits.requests, remaining: Math.max(limits.requests - quota.requestsUsed, 0) },
        bandwidth: { used: quota.bandwidthUsed, limit: limits.bandwidth, remaining: 0 },
        concurrent: { used: quota.concurrentRequests, limit: quota.tierConfig.concurrent, remaining: quota.tierConfig.concurrent - quota.concurrentRequests },
        resetAt: quota.periodEnd,
        gracePeriod: !!quota.gracePeriodEnd && quota.gracePeriodEnd > now,
        retryAfter: Math.ceil((quota.periodEnd - now) / 1000),
      };
    }

    // All checks passed
    quota.requestsUsed += requestCost;
    quota.bandwidthUsed += bandwidthCost;
    quota.concurrentRequests += 1;

    return {
      allowed: true,
      tenantId,
      tier: quota.tier,
      requests: { used: quota.requestsUsed, limit: limits.requests, remaining: Math.max(limits.requests - quota.requestsUsed, 0) },
      bandwidth: { used: quota.bandwidthUsed, limit: limits.bandwidth, remaining: Math.max(limits.bandwidth - quota.bandwidthUsed, 0) },
      concurrent: { used: quota.concurrentRequests, limit: quota.tierConfig.concurrent, remaining: Math.max(quota.tierConfig.concurrent - quota.concurrentRequests, 0) },
      resetAt: quota.periodEnd,
      gracePeriod: !!quota.gracePeriodEnd && quota.gracePeriodEnd > now,
    };
  }

  /**
   * Release concurrent request slot
   */
  async releaseConcurrent(tenantId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      const concurrentKey = `quota:${tenantId}:concurrent`;
      try {
        if (this.releaseScriptSha) {
          try {
            await this.redis.evalsha(this.releaseScriptSha, 1, concurrentKey);
          } catch {
            this.releaseScriptSha = await this.redis.script('LOAD', QUOTA_RELEASE_CONCURRENT_SCRIPT) as string;
            await this.redis.evalsha(this.releaseScriptSha, 1, concurrentKey);
          }
        } else {
          await this.redis.eval(QUOTA_RELEASE_CONCURRENT_SCRIPT, 1, concurrentKey);
        }
      } catch (error) {
        console.error('[QuotaManager] Failed to release concurrent:', error);
      }
    } else {
      const quota = this.localQuotas.get(tenantId);
      if (quota) {
        quota.concurrentRequests = Math.max(0, quota.concurrentRequests - 1);
      }
    }
  }

  /**
   * Get quota usage for dashboard
   */
  async getUsage(tenantId: string): Promise<QuotaUsage | null> {
    if (this.useRedis && this.redis) {
      return this.getUsageRedis(tenantId);
    } else {
      return this.getUsageLocal(tenantId);
    }
  }

  private async getUsageRedis(tenantId: string): Promise<QuotaUsage | null> {
    if (!this.redis) return this.getUsageLocal(tenantId);

    const now = Date.now();
    const periodStart = this.calculatePeriodStart(now);
    const periodEnd = this.calculatePeriodEnd(periodStart);
    const tierConfig = this.config.tiers[this.config.defaultTier] ?? this.config.tiers.standard;

    try {
      const [requestsUsed, bandwidthUsed] = await Promise.all([
        this.redis.get(`quota:${tenantId}:requests:${periodStart}`) as Promise<string | null>,
        this.redis.get(`quota:${tenantId}:bandwidth:${periodStart}`) as Promise<string | null>,
      ]);

      const rUsed = parseInt(requestsUsed || '0', 10);
      const bUsed = parseInt(bandwidthUsed || '0', 10);

      return {
        tenantId,
        tier: this.config.defaultTier,
        periodStart,
        periodEnd,
        requests: { used: rUsed, limit: tierConfig.requests, percent: (rUsed / tierConfig.requests) * 100 },
        bandwidth: { used: bUsed, limit: tierConfig.bandwidthBytes, percent: (bUsed / tierConfig.bandwidthBytes) * 100 },
        concurrent: { used: 0, limit: tierConfig.concurrent, percent: 0 },
        history: [], // Would need time-series data
      };
    } catch {
      return this.getUsageLocal(tenantId);
    }
  }

  private getUsageLocal(tenantId: string): QuotaUsage | null {
    const quota = this.localQuotas.get(tenantId);
    if (!quota) return null;

    const limits = this.getEffectiveLimits(quota);

    return {
      tenantId,
      tier: quota.tier,
      periodStart: quota.periodStart,
      periodEnd: quota.periodEnd,
      requests: { used: quota.requestsUsed, limit: limits.requests, percent: (quota.requestsUsed / limits.requests) * 100 },
      bandwidth: { used: quota.bandwidthUsed, limit: limits.bandwidth, percent: (quota.bandwidthUsed / limits.bandwidth) * 100 },
      concurrent: { used: quota.concurrentRequests, limit: quota.tierConfig.concurrent, percent: (quota.concurrentRequests / quota.tierConfig.concurrent) * 100 },
      history: [],
    };
  }

  /**
   * Get all tenant usage for admin dashboard
   */
  async getAllUsage(): Promise<QuotaDashboardData> {
    const tenants: QuotaUsage[] = [];
    let totalRequests = 0;
    let totalBandwidth = 0;
    let activeTenants = 0;
    let throttledTenants = 0;

    if (this.useRedis && this.redis) {
      // Would need SCAN to get all keys - simplified for now
      return this.getAllUsageLocal();
    } else {
      return this.getAllUsageLocal();
    }
  }

  private getAllUsageLocal(): QuotaDashboardData {
    const tenants: QuotaUsage[] = [];
    let totalRequests = 0;
    let totalBandwidth = 0;
    let activeTenants = 0;
    let throttledTenants = 0;

    const now = Date.now();

    for (const [tenantId, quota] of this.localQuotas.entries()) {
      if (quota.periodEnd > now) {
        const usage = this.getUsageLocal(tenantId);
        if (usage) {
          tenants.push(usage);
          totalRequests += usage.requests.used;
          totalBandwidth += usage.bandwidth.used;
          activeTenants++;
          
          if (usage.requests.percent >= 90 || usage.bandwidth.percent >= 90) {
            throttledTenants++;
          }
        }
      }
    }

    return {
      tenants,
      totals: { totalRequests, totalBandwidth, activeTenants, throttledTenants },
    };
  }

  /**
   * Set tenant tier (admin operation)
   */
  async setTenantTier(tenantId: string, tierName: string): Promise<boolean> {
    const tier = this.config.tiers[tierName];
    if (!tier) return false;

    if (this.useRedis && this.redis) {
      // Would need to migrate existing quota data
      // For now, just update local cache
    }

    const quota = this.localQuotas.get(tenantId);
    if (quota) {
      quota.tier = tierName;
      quota.tierConfig = tier;
    }

    return true;
  }

  /**
   * Reset tenant quota (admin operation)
   */
  async resetTenantQuota(tenantId: string): Promise<void> {
    if (this.useRedis && this.redis) {
      const now = Date.now();
      const periodStart = this.calculatePeriodStart(now);
      try {
        await this.redis.del(
          `quota:${tenantId}:requests:${periodStart}`,
          `quota:${tenantId}:bandwidth:${periodStart}`,
          `quota:${tenantId}:concurrent`
        );
      } catch (error) {
        console.error('[QuotaManager] Failed to reset quota:', error);
      }
    }
    
    this.localQuotas.delete(tenantId);
  }

  /**
   * Grant grace period to tenant (admin operation)
   */
  async grantGracePeriod(tenantId: string, durationMs: number): Promise<void> {
    const quota = this.localQuotas.get(tenantId);
    if (quota) {
      quota.gracePeriodEnd = Date.now() + durationMs;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): QuotaConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.useRedis && this.redis !== null;
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let quotaManagerInstance: QuotaManager | null = null;

export function getQuotaManager(config?: Partial<QuotaConfig>): QuotaManager {
  if (!quotaManagerInstance) {
    quotaManagerInstance = new QuotaManager(config);
  }
  return quotaManagerInstance;
}

export function resetQuotaManager(): void {
  quotaManagerInstance = null;
  resetRedisClient();
}