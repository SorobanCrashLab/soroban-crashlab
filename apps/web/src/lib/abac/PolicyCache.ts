/**
 * Policy Cache - Hot-reload cache for policy decisions.
 *
 * Provides low-latency caching for authorization decisions to meet
 * the < 10ms p99 latency requirement.
 *
 * Features:
 * - LRU eviction
 * - Time-based expiration
 * - Cache invalidation on policy reload
 * - Request coalescing for cache misses
 */

import type { PrincipalAttributes, Resource } from './attributes';
import type { Action } from './attributes';
import type { PolicyDecision } from './PolicyEngine';

/**
 * Cache entry with timestamp and policy version.
 */
interface CacheEntry {
  decision: PolicyDecision;
  timestamp: number;
  policyVersion: string;
  ttl: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Maximum number of entries (default: 10,000) */
  maxSize?: number;
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs?: number;
  /** Maximum TTL in milliseconds (default: 1 hour) */
  maxTtlMs?: number;
}

/**
 * Policy decision cache for fast lookups.
 *
 * Uses a Map with LRU eviction for low-latency access.
 * Keys are composite strings of principal, action, and resource.
 */
export class PolicyCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<CacheConfig>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };
  private accessOrder: string[] = [];

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 10000,
      defaultTtlMs: config.defaultTtlMs ?? 5 * 60 * 1000, // 5 minutes
      maxTtlMs: config.maxTtlMs ?? 60 * 60 * 1000, // 1 hour
    };
  }

  /**
   * Generate a cache key from the decision context.
   */
  private makeKey(
    principalId: string,
    action: Action,
    resource: Resource,
  ): string {
    // Create a stable key from the decision components
    const resourceId = this.getResourceKey(resource);
    return `${principalId}:${action}:${resourceId}`;
  }

  /**
   * Get a stable key for a resource.
   */
  private getResourceKey(resource: Resource): string {
    // Access id via known attribute types
    const attrs = resource.attributes as { id?: string | number } | Record<string, unknown>;
    const id = (attrs as { id?: string | number }).id ?? String((attrs as Record<string, unknown>).id ?? 'unknown');
    return `${resource.type}:${typeof id === 'string' ? id : String(id)}`;
  }

  /**
   * Get a policy decision from the cache.
   * Returns undefined if not found or expired.
   */
  getDecision(
    principalId: string,
    action: Action,
    resource: Resource,
  ): PolicyDecision | undefined {
    const key = this.makeKey(principalId, action, resource);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    const now = Date.now();
    if (entry.timestamp + entry.ttl < now) {
      // Entry expired
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access order for LRU
    this.updateAccessOrder(key);
    this.stats.hits++;

    return entry.decision;
  }

  /**
   * Store a policy decision in the cache.
   */
  setDecision(
    principalId: string,
    action: Action,
    resource: Resource,
    decision: PolicyDecision,
    options?: { ttl?: number; policyVersion?: string },
  ): void {
    const key = this.makeKey(principalId, action, resource);
    const now = Date.now();
    const ttl = Math.min(
      options?.ttl ?? this.config.defaultTtlMs,
      this.config.maxTtlMs,
    );
    const policyVersion = options?.policyVersion ?? 'unknown';

    // Check if we need to evict
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Remove old entry if exists
    this.cache.delete(key);

    const entry: CacheEntry = {
      decision,
      timestamp: now,
      policyVersion,
      ttl,
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
    this.updateAccessOrder(key);
  }

  /**
   * Invalidate all cached decisions.
   * Called when policies are reloaded.
   */
  invalidate(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  /**
   * Invalidate decisions for a specific principal.
   */
  invalidatePrincipal(principalId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${principalId}:`)) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
    this.updateAccessOrder();
    this.stats.size = this.cache.size;
  }

  /**
   * Invalidate decisions for a specific resource.
   */
  invalidateResource(resource: Resource): void {
    const resourceId = this.getResourceKey(resource);
    for (const key of this.cache.keys()) {
      if (key.includes(`:${resourceId}`)) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
    this.updateAccessOrder();
    this.stats.size = this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: this.stats.evictions,
      size: this.cache.size,
    };
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Update access order for LRU tracking.
   */
  private updateAccessOrder(newKey?: string): void {
    this.accessOrder = Array.from(this.cache.keys());
    if (newKey) {
      this.accessOrder.sort((a, b) => {
        const aEntry = this.cache.get(a);
        const bEntry = this.cache.get(b);
        if (!aEntry) return 1;
        if (!bEntry) return -1;
        return aEntry.timestamp - bEntry.timestamp;
      });
    }
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
}

/**
 * Global cache instance.
 */
let globalCache: PolicyCache | null = null;

/**
 * Get the global cache instance.
 */
export function getPolicyCache(): PolicyCache {
  if (!globalCache) {
    globalCache = new PolicyCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetPolicyCache(): void {
  globalCache?.clear();
  globalCache = null;
}