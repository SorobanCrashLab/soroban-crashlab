/**
 * API Gateway Hardening — Abuse Detection Engine
 *
 * Detects and scores abuse patterns:
 * - Credential stuffing (failed auth attempts)
 * - Enumeration (path scanning)
 * - Scraping (high-volume, low-entropy requests)
 * - Brute force (targeted attacks)
 * - Anomalous traffic patterns
 *
 * Uses sliding windows, anomaly scoring, and request fingerprinting.
 */

import { Redis } from '@upstash/redis';
import {
  AbuseDetectionConfig,
  AbuseDetectionResult,
  DEFAULT_ABUSE_DETECTION_CONFIG,
} from './policies';
import { getRedis, isRedisConfigured, resetRedisClient } from '@/lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestFingerprint {
  ip: string;
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  headers: Record<string, string>;
  /** Hash of fingerprint for grouping */
  hash: string;
}

export interface RequestRecord {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  fingerprint: RequestFingerprint;
  principal?: string;
  tenantId?: string;
  responseTimeMs: number;
  bytesSent: number;
  bytesReceived: number;
}

export interface SlidingWindowData {
  requests: RequestRecord[];
  uniquePaths: Set<string>;
  uniqueUserAgents: Set<string>;
  statusCodes: Map<number, number>;
  errorCount: number;
  authFailures: number;
  targetCounts: Map<string, number>; // For brute force detection
}

export interface AbusePattern {
  type: AbuseDetectionResult['type'];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  evidence: Record<string, unknown>;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

// ─── Lua Scripts ──────────────────────────────────────────────────────────────

const RECORD_REQUEST_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxEntries = tonumber(ARGV[3])
local data = ARGV[4]

-- Add new entry
redis.call('ZADD', key, now, data)

-- Remove expired entries
local windowStart = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Trim to max entries
local count = redis.call('ZCARD', key)
if count > maxEntries then
  redis.call('ZREMRANGEBYRANK', key, 0, count - maxEntries - 1)
end

-- Set expiry
redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)

return redis.call('ZCARD', key)
`;

const GET_WINDOW_DATA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

local windowStart = now - windowMs
local entries = redis.call('ZRANGEBYSCORE', key, windowStart, '+inf')
return entries
`;

// ─── AbuseDetector Class ──────────────────────────────────────────────────────

export class AbuseDetector {
  private redis: Redis | null = null;
  private config: AbuseDetectionConfig;
  private useRedis: boolean;
  private localWindows: Map<string, SlidingWindowData> = new Map();
  private patterns: Map<string, AbusePattern[]> = new Map();
  private scriptSha: string | null = null;
  private getScriptSha: string | null = null;

  constructor(config: Partial<AbuseDetectionConfig> = {}) {
    this.config = { ...DEFAULT_ABUSE_DETECTION_CONFIG, ...config };
    this.useRedis = isRedisConfigured();
    
    if (this.useRedis) {
      this.initRedis();
    }
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = getRedis();
      this.scriptSha = await this.redis.script('LOAD', RECORD_REQUEST_SCRIPT) as string;
      this.getScriptSha = await this.redis.script('LOAD', GET_WINDOW_DATA_SCRIPT) as string;
    } catch (error) {
      console.warn('[AbuseDetector] Redis initialization failed, falling back to in-memory:', error);
      this.useRedis = false;
      this.redis = null;
    }
  }

  /**
   * Record a request for abuse analysis
   */
  async recordRequest(record: RequestRecord): Promise<void> {
    const key = `abuse:${record.fingerprint.hash}`;
    const now = record.timestamp;
    const data = JSON.stringify(record);

    if (this.useRedis && this.redis) {
      try {
        if (this.scriptSha) {
          try {
            await this.redis.evalsha(this.scriptSha, 1, key, now, this.config.windowMs, 1000, data);
          } catch {
            this.scriptSha = await this.redis.script('LOAD', RECORD_REQUEST_SCRIPT) as string;
            await this.redis.evalsha(this.scriptSha, 1, key, now, this.config.windowMs, 1000, data);
          }
        } else {
          await this.redis.eval(RECORD_REQUEST_SCRIPT, 1, key, now, this.config.windowMs, 1000, data);
        }
      } catch (error) {
        console.error('[AbuseDetector] Failed to record request:', error);
        this.recordRequestLocal(record);
      }
    } else {
      this.recordRequestLocal(record);
    }
  }

  /**
   * In-memory request recording
   */
  private recordRequestLocal(record: RequestRecord): void {
    const key = `abuse:${record.fingerprint.hash}`;
    let window = this.localWindows.get(key);
    
    if (!window) {
      window = {
        requests: [],
        uniquePaths: new Set(),
        uniqueUserAgents: new Set(),
        statusCodes: new Map(),
        errorCount: 0,
        authFailures: 0,
        targetCounts: new Map(),
      };
      this.localWindows.set(key, window);
    }

    window.requests.push(record);
    window.uniquePaths.add(record.path);
    window.uniqueUserAgents.add(record.fingerprint.userAgent);
    
    const statusCount = window.statusCodes.get(record.statusCode) || 0;
    window.statusCodes.set(record.statusCode, statusCount + 1);

    if (record.statusCode >= 400) {
      window.errorCount++;
    }

    if (record.statusCode === 401 || record.statusCode === 403) {
      window.authFailures++;
    }

    // Track targets for brute force
    if (record.principal) {
      const targetCount = window.targetCounts.get(record.principal) || 0;
      window.targetCounts.set(record.principal, targetCount + 1);
    }

    // Cleanup old entries
    const windowStart = record.timestamp - this.config.windowMs;
    window.requests = window.requests.filter(r => r.timestamp > windowStart);
    
    // Rebuild sets from remaining requests
    window.uniquePaths.clear();
    window.uniqueUserAgents.clear();
    window.statusCodes.clear();
    window.errorCount = 0;
    window.authFailures = 0;
    window.targetCounts.clear();

    for (const req of window.requests) {
      window.uniquePaths.add(req.path);
      window.uniqueUserAgents.add(req.fingerprint.userAgent);
      const sc = window.statusCodes.get(req.statusCode) || 0;
      window.statusCodes.set(req.statusCode, sc + 1);
      if (req.statusCode >= 400) window.errorCount++;
      if (req.statusCode === 401 || req.statusCode === 403) window.authFailures++;
      if (req.principal) {
        const tc = window.targetCounts.get(req.principal) || 0;
        window.targetCounts.set(req.principal, tc + 1);
      }
    }
  }

  /**
   * Analyze a fingerprint for abuse patterns
   */
  async analyze(fingerprintHash: string): Promise<AbuseDetectionResult> {
    if (this.useRedis && this.redis) {
      return this.analyzeRedis(fingerprintHash);
    } else {
      return this.analyzeLocal(fingerprintHash);
    }
  }

  /**
   * Redis-backed analysis
   */
  private async analyzeRedis(fingerprintHash: string): Promise<AbuseDetectionResult> {
    if (!this.redis) return this.analyzeLocal(fingerprintHash);

    const key = `abuse:${fingerprintHash}`;
    const now = Date.now();

    try {
      let entries: string[];
      
      if (this.getScriptSha) {
        try {
          entries = await this.redis.evalsha(this.getScriptSha, 1, key, now, this.config.windowMs) as string[];
        } catch {
          this.getScriptSha = await this.redis.script('LOAD', GET_WINDOW_DATA_SCRIPT) as string;
          entries = await this.redis.evalsha(this.getScriptSha, 1, key, now, this.config.windowMs) as string[];
        }
      } else {
        entries = await this.redis.eval(GET_WINDOW_DATA_SCRIPT, 1, key, now, this.config.windowMs) as string[];
      }

      if (!entries || entries.length < this.config.minRequestsForAnalysis) {
        return this.createResult('none', 0, [], 'allow', {});
      }

      const records = entries.map(e => JSON.parse(e) as RequestRecord);
      return this.analyzeRecords(records, fingerprintHash);
    } catch (error) {
      console.error('[AbuseDetector] Redis analysis failed:', error);
      return this.analyzeLocal(fingerprintHash);
    }
  }

  /**
   * In-memory analysis
   */
  private analyzeLocal(fingerprintHash: string): AbuseDetectionResult {
    const key = `abuse:${fingerprintHash}`;
    const window = this.localWindows.get(key);

    if (!window || window.requests.length < this.config.minRequestsForAnalysis) {
      return this.createResult('none', 0, [], 'allow', {});
    }

    return this.analyzeRecords(window.requests, fingerprintHash);
  }

  /**
   * Core analysis logic
   */
  private analyzeRecords(records: RequestRecord[], fingerprintHash: string): AbuseDetectionResult {
    const patterns: string[] = [];
    let maxScore = 0;
    let detectedType: AbuseDetectionResult['type'] = 'none';
    let action: AbuseDetectionResult['action'] = 'allow';
    const evidence: Record<string, unknown> = {
      requestCount: records.length,
      uniquePaths: new Set(records.map(r => r.path)).size,
      uniqueUserAgents: new Set(records.map(r => r.fingerprint.userAgent)).size,
      errorRate: records.filter(r => r.statusCode >= 400).length / records.length,
      authFailureRate: records.filter(r => r.statusCode === 401 || r.statusCode === 403).length / records.length,
    };

    // Credential stuffing detection
    if (this.config.credentialStuffing.enabled) {
      const authFailures = records.filter(r => r.statusCode === 401 || r.statusCode === 403).length;
      if (authFailures >= this.config.credentialStuffing.maxFailedAuthPerWindow) {
        patterns.push('credential-stuffing');
        const score = Math.min(100, (authFailures / this.config.credentialStuffing.maxFailedAuthPerWindow) * 100);
        if (score > maxScore) {
          maxScore = score;
          detectedType = 'credential-stuffing';
          action = 'block';
        }
        evidence.credentialStuffing = { authFailures, threshold: this.config.credentialStuffing.maxFailedAuthPerWindow };
      }
    }

    // Enumeration detection
    if (this.config.enumeration.enabled) {
      const uniquePaths = new Set(records.map(r => r.path)).size;
      if (uniquePaths >= this.config.enumeration.maxUniquePathsPerWindow) {
        patterns.push('enumeration');
        const sensitivityMultiplier = { low: 1.5, medium: 1.0, high: 0.7 }[this.config.enumeration.sensitivity];
        const score = Math.min(100, (uniquePaths / (this.config.enumeration.maxUniquePathsPerWindow * sensitivityMultiplier)) * 100);
        if (score > maxScore) {
          maxScore = score;
          detectedType = 'enumeration';
          action = score > 80 ? 'block' : 'rate-limit';
        }
        evidence.enumeration = { uniquePaths, threshold: this.config.enumeration.maxUniquePathsPerWindow };
      }
    }

    // Scraping detection
    if (this.config.scraping.enabled) {
      const requestCount = records.length;
      const uniqueUserAgents = new Set(records.map(r => r.fingerprint.userAgent)).size;
      
      // Calculate user agent entropy
      const uaCounts = new Map<string, number>();
      for (const r of records) {
        const count = uaCounts.get(r.fingerprint.userAgent) || 0;
        uaCounts.set(r.fingerprint.userAgent, count + 1);
      }
      
      let entropy = 0;
      for (const count of uaCounts.values()) {
        const p = count / requestCount;
        entropy -= p * Math.log2(p);
      }

      if (requestCount >= this.config.scraping.maxRequestsPerWindow ||
          uniqueUserAgents < this.config.scraping.minUniqueUserAgents ||
          entropy < this.config.scraping.entropyThreshold) {
        patterns.push('scraping');
        const score = Math.min(100, 
          (requestCount / this.config.scraping.maxRequestsPerWindow) * 50 +
          (1 - uniqueUserAgents / this.config.scraping.minUniqueUserAgents) * 30 +
          (1 - entropy / this.config.scraping.entropyThreshold) * 20
        );
        if (score > maxScore) {
          maxScore = score;
          detectedType = 'scraping';
          action = score > 70 ? 'block' : 'challenge';
        }
        evidence.scraping = { requestCount, uniqueUserAgents, entropy, threshold: this.config.scraping.maxRequestsPerWindow };
      }
    }

    // Brute force detection
    if (this.config.bruteForce.enabled) {
      const targetCounts = new Map<string, number>();
      for (const r of records) {
        if (r.principal) {
          const count = targetCounts.get(r.principal) || 0;
          targetCounts.set(r.principal, count + 1);
        }
      }

      for (const [target, count] of targetCounts.entries()) {
        if (count >= this.config.bruteForce.maxAttemptsPerTarget) {
          patterns.push('brute-force');
          const score = Math.min(100, (count / this.config.bruteForce.maxAttemptsPerTarget) * 100);
          if (score > maxScore) {
            maxScore = score;
            detectedType = 'brute-force';
            action = count >= this.config.bruteForce.escalateAfter * this.config.bruteForce.maxAttemptsPerTarget ? 'escalate' : 'block';
          }
          evidence.bruteForce = { target, attempts: count, threshold: this.config.bruteForce.maxAttemptsPerTarget };
          break; // Report first detected target
        }
      }
    }

    // Anomalous traffic detection (fallback)
    if (maxScore === 0 && patterns.length === 0) {
      const errorRate = evidence.errorRate as number;
      const authFailureRate = evidence.authFailureRate as number;
      
      if (errorRate > 0.5 || authFailureRate > 0.3) {
        patterns.push('anomalous');
        maxScore = Math.min(100, (errorRate * 50 + authFailureRate * 50) * 100);
        detectedType = 'anomalous';
        action = 'rate-limit';
        evidence.anomalous = { errorRate, authFailureRate };
      }
    }

    // Store pattern for tracking
    this.trackPattern(fingerprintHash, detectedType, maxScore, patterns, evidence);

    return this.createResult(detectedType, maxScore, patterns, action, evidence);
  }

  /**
   * Track detected pattern
   */
  private trackPattern(
    fingerprintHash: string,
    type: AbuseDetectionResult['type'],
    score: number,
    patterns: string[],
    evidence: Record<string, unknown>
  ): void {
    if (type === 'none') return;

    const key = `pattern:${fingerprintHash}`;
    let patternList = this.patterns.get(key) || [];
    
    const now = Date.now();
    const existing = patternList.find(p => p.type === type);
    
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.severity = score > 80 ? 'critical' : score > 60 ? 'high' : score > 40 ? 'medium' : 'low';
      existing.evidence = evidence;
    } else {
      patternList.push({
        type,
        severity: score > 80 ? 'critical' : score > 60 ? 'high' : score > 40 ? 'medium' : 'low',
        confidence: Math.min(1, score / 100),
        evidence,
        firstSeen: now,
        lastSeen: now,
        count: 1,
      });
    }

    // Keep only recent patterns
    patternList = patternList.filter(p => now - p.lastSeen < 3600000); // 1 hour
    this.patterns.set(key, patternList);
  }

  /**
   * Create standardized result
   */
  private createResult(
    type: AbuseDetectionResult['type'],
    score: number,
    patterns: string[],
    action: AbuseDetectionResult['action'],
    evidence: Record<string, unknown>
  ): AbuseDetectionResult {
    return {
      detected: type !== 'none',
      type,
      score: Math.round(score),
      patterns,
      action,
      evidence,
    };
  }

  /**
   * Get request fingerprint from request
   */
  static getFingerprint(request: Request, principal?: string, tenantId?: string): RequestFingerprint {
    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      if (key.startsWith('x-') || key.startsWith('sec-') || ['user-agent', 'accept', 'accept-language', 'accept-encoding'].includes(key)) {
        headers[key] = value;
      }
    }

    const fp = {
      ip: headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || 'unknown',
      userAgent: headers['user-agent'] || 'unknown',
      acceptLanguage: headers['accept-language'] || '',
      acceptEncoding: headers['accept-encoding'] || '',
      headers,
    };

    // Create hash for grouping
    const hashData = `${fp.ip}:${fp.userAgent}:${fp.acceptLanguage}:${fp.acceptEncoding}`;
    let hash = 0;
    for (let i = 0; i < hashData.length; i++) {
      hash = ((hash << 5) - hash) + hashData.charCodeAt(i);
      hash |= 0;
    }
    fp.hash = `fp_${Math.abs(hash).toString(36)}`;

    return fp;
  }

  /**
   * Get active patterns for a fingerprint
   */
  getPatterns(fingerprintHash: string): AbusePattern[] {
    return this.patterns.get(`pattern:${fingerprintHash}`) || [];
  }

  /**
   * Clear patterns for a fingerprint (e.g., after successful challenge)
   */
  clearPatterns(fingerprintHash: string): void {
    this.patterns.delete(`pattern:${fingerprintHash}`);
  }

  /**
   * Get detector status
   */
  getStatus(): { redis: boolean; localWindows: number; trackedPatterns: number } {
    return {
      redis: this.useRedis && this.redis !== null,
      localWindows: this.localWindows.size,
      trackedPatterns: this.patterns.size,
    };
  }

  /**
   * Cleanup old data
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.windowMs * 2;

    for (const [key, window] of this.localWindows.entries()) {
      if (window.requests.length === 0 || now - window.requests[window.requests.length - 1].timestamp > maxAge) {
        this.localWindows.delete(key);
      }
    }

    for (const [key, patterns] of this.patterns.entries()) {
      const recent = patterns.filter(p => now - p.lastSeen < maxAge);
      if (recent.length === 0) {
        this.patterns.delete(key);
      } else {
        this.patterns.set(key, recent);
      }
    }
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let detectorInstance: AbuseDetector | null = null;

export function getAbuseDetector(config?: Partial<AbuseDetectionConfig>): AbuseDetector {
  if (!detectorInstance) {
    detectorInstance = new AbuseDetector(config);
  }
  return detectorInstance;
}

export function resetAbuseDetector(): void {
  detectorInstance = null;
  resetRedisClient();
}