/**
 * API Gateway Hardening — IP Reputation System
 *
 * Provides IP reputation scoring with:
 * - Threat intelligence feed integration
 * - Internal reputation scoring based on behavior
 * - Caching with TTL
 * - Automated challenge/block/escalate workflows
 * - Graceful degradation when feeds unavailable
 */

import { Redis } from '@upstash/redis';
import {
  IPReputationConfig,
  IPReputationResult,
  DEFAULT_IP_REPUTATION_CONFIG,
} from './policies';
import { getRedis, isRedisConfigured, resetRedisClient } from '@/lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreatFeedEntry {
  /** IP address */
  ip: string;
  /** Threat score (0-100) */
  score: number;
  /** Threat categories */
  categories: string[];
  /** Last seen in feed */
  lastSeen: number;
  /** Source feed name */
  source: string;
  /** Confidence level (0-1) */
  confidence: number;
}

export interface ReputationCacheEntry {
  ip: string;
  score: number;
  categories: string[];
  inThreatFeed: boolean;
  lastSeen: number;
  cachedAt: number;
  ttl: number;
}

export interface ThreatFeedData {
  /** Feed identifier/name */
  name: string;
  /** URL to fetch feed data */
  url: string;
  /** Entries from this feed */
  entries: ThreatFeedEntry[];
  /** Last fetched timestamp */
  lastFetched: number;
  /** Fetch interval in ms */
  fetchInterval: number;
}

// ─── Threat Feed Integration ──────────────────────────────────────────────────

/**
 * Parse threat feed data from common formats
 */
export function parseThreatFeed(raw: string, feedName: string): ThreatFeedEntry[] {
  try {
    const parsed = JSON.parse(raw);
    const entries: ThreatFeedEntry[] = [];

    // Handle common threat feed formats
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'object' && item && 'ip' in item) {
          entries.push(normalizeFeedEntry(item as Record<string, unknown>, feedName));
        }
      }
    } else if (typeof parsed === 'object' && parsed) {
      // Handle key-value format where keys are IPs
      for (const [ip, data] of Object.entries(parsed)) {
        if (typeof data === 'object' && data) {
          entries.push(normalizeFeedEntry({ ip, ...data }, feedName));
        }
      }
    }

    return entries;
  } catch {
    // Fallback: try line-by-line format (one IP per line)
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
      .map(ip => ({
        ip,
        score: 70, // Default suspicious score
        categories: ['unknown-threat'],
        lastSeen: Date.now(),
        source: feedName,
        confidence: 0.5,
      }));
  }
}

function normalizeFeedEntry(item: Record<string, unknown>, feedName: string): ThreatFeedEntry {
  return {
    ip: String(item.ip || item.address || item.source || item.target || ''),
    score: Math.max(0, Math.min(100, Number(item.score || item.severity || item.threat_level || 0))),
    categories: Array.isArray(item.categories)
      ? item.categories.map(String)
      : [String(item.category || item.type || 'unknown')],
    lastSeen: Number(item.last_seen || item.lastSeen || item.timestamp || Date.now()),
    source: feedName,
    confidence: Math.max(0, Math.min(1, Number(item.confidence || 0.5))),
  };
}

// ─── IPReputation Class ──────────────────────────────────────────────────────

export class IPReputation {
  private redis: Redis | null = null;
  private config: IPReputationConfig;
  private useRedis: boolean;
  private localCache: Map<string, ReputationCacheEntry> = new Map();
  private internalScores: Map<string, number> = new Map();
  private feedData: Map<string, ThreatFeedData> = new Map();
  private fetchIntervals: NodeJS.Timeout[] = [];

  constructor(config: Partial<IPReputationConfig> = {}) {
    this.config = { ...DEFAULT_IP_REPUTATION_CONFIG, ...config };
    this.useRedis = isRedisConfigured();
    
    if (this.useRedis) {
      this.initRedis();
    }
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = getRedis();
    } catch (error) {
      console.warn('[IPReputation] Redis initialization failed, falling back to in-memory:', error);
      this.useRedis = false;
      this.redis = null;
    }
  }

  /**
   * Check IP reputation score
   */
  async check(ip: string): Promise<IPReputationResult> {
    const now = Date.now();

    // Try cache first
    const cached = this.getCached(ip);
    if (cached && now - cached.cachedAt < cached.ttl) {
      return this.fromCache(cached);
    }

    // Combine internal and external scores
    const internalScore = this.getInternalScore(ip);
    const externalScore = await this.getExternalScore(ip);

    // Weighted combination
    const combinedScore = Math.min(100,
      internalScore * 0.4 +  // 40% internal behavior
      externalScore * 0.6    // 60% external threat intel
    );

    // Determine categories
    const categories = new Set<string>();
    
    if (combinedScore >= this.config.challengeThreshold) {
      categories.add('suspicious');
    }
    if (combinedScore >= this.config.blockThreshold) {
      categories.add('malicious');
    }
    if (combinedScore >= this.config.escalateThreshold) {
      categories.add('critical-threat');
    }

    // Determine action
    let action: IPReputationResult['action'] = 'allow';
    if (combinedScore >= this.config.escalateThreshold) {
      action = 'escalate';
    } else if (combinedScore >= this.config.blockThreshold) {
      action = 'block';
    } else if (combinedScore >= this.config.challengeThreshold) {
      action = 'challenge';
    }

    // Cache result
    const result: IPReputationResult = {
      ip,
      score: Math.round(combinedScore),
      categories: [...categories],
      inThreatFeed: externalScore > 0,
      lastSeen: externalScore > 0 ? now : undefined,
      action,
      source: combinedScore > 0 ? 'cache' : 'unknown',
    };

    this.cacheResult(ip, result);
    return result;
  }

  /**
   * Get cached result
   */
  private getCached(ip: string): ReputationCacheEntry | null {
    if (this.useRedis && this.redis) {
      try {
        const cached = this.redis.get(`reputation:${ip}`);
        if (cached) {
          return cached as ReputationCacheEntry;
        }
      } catch {
        // Fall through to local cache
      }
    }

    return this.localCache.get(ip) || null;
  }

  /**
   * Cache reputation result
   */
  private cacheResult(ip: string, result: IPReputationResult): void {
    const entry: ReputationCacheEntry = {
      ip: result.ip,
      score: result.score,
      categories: result.categories,
      inThreatFeed: result.inThreatFeed,
      lastSeen: result.lastSeen,
      cachedAt: Date.now(),
      ttl: this.config.cacheTtlMs,
    };

    if (this.useRedis && this.redis) {
      try {
        this.redis.setex(`reputation:${ip}`, Math.ceil(this.config.cacheTtlMs / 1000), JSON.stringify(entry));
      } catch {
        // Fall through to local cache
      }
    }

    this.localCache.set(ip, entry);
  }

  /**
   * Convert cached entry to result
   */
  private fromCache(entry: ReputationCacheEntry): IPReputationResult {
    let action: IPReputationResult['action'] = 'allow';
    if (entry.score >= this.config.escalateThreshold) {
      action = 'escalate';
    } else if (entry.score >= this.config.blockThreshold) {
      action = 'block';
    } else if (entry.score >= this.config.challengeThreshold) {
      action = 'challenge';
    }

    return {
      ip: entry.ip,
      score: entry.score,
      categories: entry.categories,
      inThreatFeed: entry.inThreatFeed,
      lastSeen: entry.lastSeen,
      action,
      source: 'cache',
    };
  }

  /**
   * Get internal reputation score based on behavior
   */
  private getInternalScore(ip: string): number {
    const score = this.internalScores.get(ip) ?? 0;
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Record a bad behavior event for an IP
   */
  recordBadBehavior(ip: string, severity: number = 10): void {
    const current = this.internalScores.get(ip) ?? 0;
    const newScore = Math.min(100, current + severity);
    this.internalScores.set(ip, newScore);

    // Invalidate cache to pick up new score
    this.localCache.delete(ip);
  }

  /**
   * Record a good behavior event for an IP (reputation recovery)
   */
  recordGoodBehavior(ip: string, amount: number = 5): void {
    const current = this.internalScores.get(ip) ?? 0;
    const newScore = Math.max(0, current - amount);
    this.internalScores.set(ip, newScore);

    // Invalidate cache
    this.localCache.delete(ip);
  }

  /**
   * Reset internal score for an IP (admin operation)
   */
  resetInternalScore(ip: string): void {
    this.internalScores.delete(ip);
    this.localCache.delete(ip);
  }

  /**
   * Get external score from threat feeds
   */
  private async getExternalScore(ip: string): Promise<number> {
    if (!this.config.threatFeeds || this.config.threatFeeds.length === 0) {
      return 0;
    }

    // Check locally cached feed data
    for (const [, feed] of this.feedData.entries()) {
      const entry = feed.entries.find(e => e.ip === ip);
      if (entry) {
        return entry.score;
      }
    }

    // Try fetching from feeds (in production, this would be async)
    // For now, return 0 to indicate no external data
    return 0;
  }

  /**
   * Load threat feed data
   */
  async loadFeed(name: string, url: string, intervalMs: number = 3600000): Promise<void> {
    const feed: ThreatFeedData = {
      name,
      url,
      entries: [],
      lastFetched: 0,
      fetchInterval: intervalMs,
    };

    this.feedData.set(name, feed);

    // Fetch immediately
    try {
      await this.fetchFeed(feed);
    } catch (error) {
      console.error(`[IPReputation] Failed to fetch feed ${name}:`, error);
    }

    // Start periodic fetch
    const interval = setInterval(() => {
      this.fetchFeed(feed).catch(error => {
        console.error(`[IPReputation] Feed fetch failed (${name}):`, error);
      });
    }, intervalMs);

    this.fetchIntervals.push(interval);
  }

  /**
   * Fetch a single feed
   */
  private async fetchFeed(feed: ThreatFeedData): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(feed.url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        feed.entries = parseThreatFeed(text, feed.name);
        feed.lastFetched = Date.now();

        // Update cache with new feed data
        for (const entry of feed.entries) {
          this.cacheResult(entry.ip, {
            ip: entry.ip,
            score: entry.score,
            categories: entry.categories,
            inThreatFeed: true,
            lastSeen: entry.lastSeen,
            action: entry.score >= this.config.blockThreshold ? 'block' :
                   entry.score >= this.config.challengeThreshold ? 'challenge' : 'allow',
            source: 'threat-feed',
          });
        }
      }
    } catch (error) {
      if (this.config.failOpen) {
        // Silently fail - no data, no blocking
        console.warn(`[IPReputation] Feed fetch failed (fail-open): ${feed.name}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Stop all feed fetch intervals
   */
  stopFeeds(): void {
    for (const interval of this.fetchIntervals) {
      clearInterval(interval);
    }
    this.fetchIntervals = [];
  }

  /**
   * Get all threat feeds
   */
  getFeeds(): ThreatFeedData[] {
    return [...this.feedData.values()];
  }

  /**
   * Get internal score for an IP (for debugging)
   */
  getInternalScorePublic(ip: string): number {
    return this.internalScores.get(ip) ?? 0;
  }

  /**
   * Get reputation status
   */
  getStatus(): {
    redis: boolean;
    cacheSize: number;
    internalScores: number;
    feeds: number;
  } {
    return {
      redis: this.useRedis && this.redis !== null,
      cacheSize: this.localCache.size,
      internalScores: this.internalScores.size,
      feeds: this.feedData.size,
    };
  }

  /**
   * Cleanup old data
   */
  cleanup(): void {
    const now = Date.now();

    // Clean up expired cache entries
    for (const [ip, entry] of this.localCache.entries()) {
      if (now - entry.cachedAt > entry.ttl) {
        this.localCache.delete(ip);
      }
    }

    // Clean up internal scores (decay over time)
    for (const [ip, score] of this.internalScores.entries()) {
      const decayed = score * 0.9; // 10% decay per cleanup
      if (decayed < 1) {
        this.internalScores.delete(ip);
      } else {
        this.internalScores.set(ip, decayed);
      }
    }
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let reputationInstance: IPReputation | null = null;

export function getIPReputation(config?: Partial<IPReputationConfig>): IPReputation {
  if (!reputationInstance) {
    reputationInstance = new IPReputation(config);
  }
  return reputationInstance;
}

export function resetIPReputation(): void {
  if (reputationInstance) {
    reputationInstance.stopFeeds();
  }
  reputationInstance = null;
  resetRedisClient();
}