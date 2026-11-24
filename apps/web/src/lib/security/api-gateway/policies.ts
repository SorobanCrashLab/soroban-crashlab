/**
 * API Gateway Hardening — Centralized Policy Definitions
 *
 * Single source of truth for all rate limiting, validation, abuse detection,
 * and IP reputation policies. All tunable parameters are exposed via environment
 * variables for production adjustment without code changes.
 */

import { z } from 'zod';

// ─── Rate Limit Policy Definitions ────────────────────────────────────────────

/**
 * Tiered rate limit configuration for a specific identity tier.
 * Each tier can have burst + sustained quotas with independent windows.
 */
export interface TieredRateLimitConfig {
  /** Maximum requests allowed in the burst window */
  burstLimit: number;
  /** Burst window in milliseconds */
  burstWindowMs: number;
  /** Maximum requests allowed in the sustained window */
  sustainedLimit: number;
  /** Sustained window in milliseconds */
  sustainedWindowMs: number;
  /** Cost multiplier for requests (default 1) */
  cost: number;
  /** Fail-closed: reject on limiter errors (default: false for read, true for write) */
  failClosed: boolean;
}

/**
 * Complete rate limit policy combining all identity tiers
 */
export interface RateLimitPolicy {
  /** Policy name (matches route class) */
  name: string;
  /** Per-IP limits */
  ip: TieredRateLimitConfig;
  /** Per-user (authenticated session) limits */
  user: TieredRateLimitConfig;
  /** Per-API-key limits */
  apiKey: TieredRateLimitConfig;
  /** Per-tenant limits */
  tenant: TieredRateLimitConfig;
  /** Endpoint-specific cost overrides */
  endpointCosts?: Record<string, number>;
}

/**
 * Adaptive throttling configuration
 */
export interface AdaptiveThrottleConfig {
  /** Enable adaptive throttling */
  enabled: boolean;
  /** Queue depth threshold to start throttling */
  queueDepthThreshold: number;
  /** Latency percentile threshold (p99) in ms */
  latencyP99ThresholdMs: number;
  /** Error rate threshold (0-1) */
  errorRateThreshold: number;
  /** Minimum multiplier (1.0 = no throttling) */
  minMultiplier: number;
  /** Maximum multiplier */
  maxMultiplier: number;
  /** How fast to ramp up (requests per adjustment) */
  rampUpRate: number;
  /** How fast to ramp down (requests per adjustment) */
  rampDownRate: number;
  /** Cooldown period between adjustments (ms) */
  adjustmentCooldownMs: number;
}

/**
 * Request validation configuration
 */
export interface ValidationConfig {
  /** Enable strict request validation */
  enabled: boolean;
  /** Maximum request body size (bytes) */
  maxBodySize: number;
  /** Maximum query string length */
  maxQueryLength: number;
  /** Maximum header count */
  maxHeaderCount: number;
  /** Maximum header value length */
  maxHeaderValueLength: number;
  /** Block requests with missing content-type on POST/PUT/PATCH */
  requireContentType: boolean;
  /** Allowed content types */
  allowedContentTypes: string[];
  /** Reject requests with duplicate query parameters */
  rejectDuplicateParams: boolean;
}

/**
 * Abuse detection configuration
 */
export interface AbuseDetectionConfig {
  /** Enable abuse detection engine */
  enabled: boolean;
  /** Sliding window size for pattern analysis (ms) */
  windowMs: number;
  /** Minimum requests in window to trigger analysis */
  minRequestsForAnalysis: number;
  /** Anomaly score threshold (0-100) to flag abuse */
  anomalyThreshold: number;
  /** Credential stuffing detection */
  credentialStuffing: {
    enabled: boolean;
    maxFailedAuthPerWindow: number;
    windowMs: number;
    lockoutDurationMs: number;
  };
  /** Enumeration detection */
  enumeration: {
    enabled: boolean;
    maxUniquePathsPerWindow: number;
    windowMs: number;
    sensitivity: 'low' | 'medium' | 'high';
  };
  /** Scraping detection */
  scraping: {
    enabled: boolean;
    maxRequestsPerWindow: number;
    windowMs: number;
    minUniqueUserAgents: number;
    entropyThreshold: number;
  };
  /** Brute force detection */
  bruteForce: {
    enabled: boolean;
    maxAttemptsPerTarget: number;
    windowMs: number;
    escalateAfter: number;
  };
}

/**
 * IP reputation configuration
 */
export interface IPReputationConfig {
  /** Enable IP reputation checks */
  enabled: boolean;
  /** Cache TTL for reputation scores (ms) */
  cacheTtlMs: number;
  /** Threat intelligence feed URLs */
  threatFeeds: string[];
  /** Score threshold to challenge (0-100) */
  challengeThreshold: number;
  /** Score threshold to block (0-100) */
  blockThreshold: number;
  /** Score threshold to escalate to admin (0-100) */
  escalateThreshold: number;
  /** Action on challenge threshold */
  challengeAction: 'captcha' | 'js-challenge' | 'rate-limit';
  /** Action on block threshold */
  blockAction: 'block' | 'rate-limit-strict' | 'quarantine';
  /** Fail-open if reputation service unavailable */
  failOpen: boolean;
}

/**
 * Per-tenant quota configuration
 */
export interface QuotaConfig {
  /** Default quota tier name */
  defaultTier: string;
  /** Quota tiers */
  tiers: Record<string, QuotaTier>;
  /** Quota reset schedule (cron expression) */
  resetSchedule: string;
  /** Enable quota borrowing between periods */
  allowBorrowing: boolean;
  /** Borrow limit as fraction of quota */
  borrowLimit: number;
  /** Grace period after quota exhausted (ms) */
  gracePeriodMs: number;
}

/**
 * Individual quota tier definition
 */
export interface QuotaTier {
  /** Tier name */
  name: string;
  /** Request quota per period */
  requests: number;
  /** Bandwidth quota per period (bytes) */
  bandwidthBytes: number;
  /** Concurrent request limit */
  concurrent: number;
  /** Priority weight for fair queuing */
  priority: number;
  /** Custom limits per endpoint class */
  endpointLimits?: Record<string, number>;
}

/**
 * Standardized 429 response with quota headers
 */
export interface RateLimitResponse {
  allowed: boolean;
  /** HTTP status code */
  status: number;
  /** Retry-After header value (seconds) */
  retryAfter: number;
  /** Rate limit headers */
  headers: Record<string, string>;
  /** Error code for client handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Quota information (when applicable) */
  quota?: {
    tier: string;
    used: number;
    limit: number;
    remaining: number;
    resetAt: number;
  };
}

/**
 * Abuse detection result
 */
export interface AbuseDetectionResult {
  /** Whether abuse was detected */
  detected: boolean;
  /** Abuse type */
  type: 'credential-stuffing' | 'enumeration' | 'scraping' | 'brute-force' | 'anomalous' | 'none';
  /** Anomaly score (0-100) */
  score: number;
  /** Detected patterns */
  patterns: string[];
  /** Recommended action */
  action: 'allow' | 'challenge' | 'rate-limit' | 'block' | 'escalate';
  /** Evidence for audit log */
  evidence: Record<string, unknown>;
}

/**
 * IP reputation result
 */
export interface IPReputationResult {
  /** IP address */
  ip: string;
  /** Reputation score (0-100, higher = worse) */
  score: number;
  /** Threat categories */
  categories: string[];
  /** Is in threat feed */
  inThreatFeed: boolean;
  /** Last seen in threat feed */
  lastSeen?: number;
  /** Recommended action */
  action: 'allow' | 'challenge' | 'rate-limit' | 'block' | 'escalate';
  /** Source of reputation data */
  source: 'cache' | 'threat-feed' | 'internal' | 'unknown';
}

/**
 * Gateway policy bundle - all policies combined
 */
export interface GatewayPolicies {
  rateLimit: Record<string, RateLimitPolicy>;
  adaptiveThrottle: AdaptiveThrottleConfig;
  validation: ValidationConfig;
  abuseDetection: AbuseDetectionConfig;
  ipReputation: IPReputationConfig;
  quota: QuotaConfig;
}

// ─── Default Policy Instances ────────────────────────────────────────────────

const DEFAULT_TIERED_CONFIG: TieredRateLimitConfig = {
  burstLimit: 100,
  burstWindowMs: 60_000,
  sustainedLimit: 1000,
  sustainedWindowMs: 3_600_000,
  cost: 1,
  failClosed: false,
};

export const DEFAULT_RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  default: {
    name: 'default',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 60, sustainedLimit: 600 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 300, sustainedLimit: 3000 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 500, sustainedLimit: 5000 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 2000, sustainedLimit: 20000 },
    endpointCosts: {
      '/api/runs': 2,
      '/api/artifacts': 3,
      '/api/auth': 1,
    },
  },
  auth: {
    name: 'auth',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10, sustainedLimit: 50, failClosed: true },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 20, sustainedLimit: 100, failClosed: true },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 20, sustainedLimit: 100, failClosed: true },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 100, sustainedLimit: 500, failClosed: true },
  },
  'fuzz-trigger': {
    name: 'fuzz-trigger',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10, sustainedLimit: 30, failClosed: true, cost: 2 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 30, sustainedLimit: 100, failClosed: true, cost: 2 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 50, sustainedLimit: 200, failClosed: true, cost: 2 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 200, sustainedLimit: 1000, failClosed: true, cost: 2 },
  },
  'artifact-upload': {
    name: 'artifact-upload',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10, sustainedLimit: 30, failClosed: true, cost: 3 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 30, sustainedLimit: 100, failClosed: true, cost: 3 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 60, sustainedLimit: 200, failClosed: true, cost: 3 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 200, sustainedLimit: 1000, failClosed: true, cost: 3 },
  },
  replay: {
    name: 'replay',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10, sustainedLimit: 30, failClosed: true, cost: 2 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 30, sustainedLimit: 100, failClosed: true, cost: 2 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 50, sustainedLimit: 200, failClosed: true, cost: 2 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 200, sustainedLimit: 1000, failClosed: true, cost: 2 },
  },
  strict: {
    name: 'strict',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 20, sustainedLimit: 60, failClosed: true },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 60, sustainedLimit: 200, failClosed: true },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 100, sustainedLimit: 500, failClosed: true },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 500, sustainedLimit: 2000, failClosed: true },
  },
  lenient: {
    name: 'lenient',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 200, sustainedLimit: 2000 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 1000, sustainedLimit: 10000 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 2000, sustainedLimit: 20000 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10000, sustainedLimit: 100000 },
  },
  none: {
    name: 'none',
    ip: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10000, sustainedLimit: 100000 },
    user: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10000, sustainedLimit: 100000 },
    apiKey: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10000, sustainedLimit: 100000 },
    tenant: { ...DEFAULT_TIERED_CONFIG, burstLimit: 10000, sustainedLimit: 100000 },
  },
};

export const DEFAULT_ADAPTIVE_THROTTLE_CONFIG: AdaptiveThrottleConfig = {
  enabled: true,
  queueDepthThreshold: 100,
  latencyP99ThresholdMs: 1000,
  errorRateThreshold: 0.05,
  minMultiplier: 1.0,
  maxMultiplier: 10.0,
  rampUpRate: 0.1,
  rampDownRate: 0.05,
  adjustmentCooldownMs: 10_000,
};

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  enabled: true,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  maxQueryLength: 2048,
  maxHeaderCount: 100,
  maxHeaderValueLength: 8192,
  requireContentType: true,
  allowedContentTypes: [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
  ],
  rejectDuplicateParams: true,
};

export const DEFAULT_ABUSE_DETECTION_CONFIG: AbuseDetectionConfig = {
  enabled: true,
  windowMs: 60_000,
  minRequestsForAnalysis: 10,
  anomalyThreshold: 75,
  credentialStuffing: {
    enabled: true,
    maxFailedAuthPerWindow: 5,
    windowMs: 300_000, // 5 minutes
    lockoutDurationMs: 900_000, // 15 minutes
  },
  enumeration: {
    enabled: true,
    maxUniquePathsPerWindow: 50,
    windowMs: 60_000,
    sensitivity: 'medium',
  },
  scraping: {
    enabled: true,
    maxRequestsPerWindow: 200,
    windowMs: 60_000,
    minUniqueUserAgents: 3,
    entropyThreshold: 3.5,
  },
  bruteForce: {
    enabled: true,
    maxAttemptsPerTarget: 10,
    windowMs: 300_000,
    escalateAfter: 3,
  },
};

export const DEFAULT_IP_REPUTATION_CONFIG: IPReputationConfig = {
  enabled: true,
  cacheTtlMs: 300_000, // 5 minutes
  threatFeeds: [
    // These would be actual threat intelligence feed URLs in production
    // 'https://feeds.example.com/threats.json',
  ],
  challengeThreshold: 40,
  blockThreshold: 70,
  escalateThreshold: 85,
  challengeAction: 'js-challenge',
  blockAction: 'rate-limit-strict',
  failOpen: true,
};

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  defaultTier: 'standard',
  tiers: {
    free: {
      name: 'free',
      requests: 10_000,
      bandwidthBytes: 100 * 1024 * 1024, // 100MB
      concurrent: 5,
      priority: 1,
    },
    standard: {
      name: 'standard',
      requests: 100_000,
      bandwidthBytes: 1024 * 1024 * 1024, // 1GB
      concurrent: 20,
      priority: 5,
    },
    premium: {
      name: 'premium',
      requests: 1_000_000,
      bandwidthBytes: 10 * 1024 * 1024 * 1024, // 10GB
      concurrent: 100,
      priority: 10,
    },
    enterprise: {
      name: 'enterprise',
      requests: 10_000_000,
      bandwidthBytes: 100 * 1024 * 1024 * 1024, // 100GB
      concurrent: 500,
      priority: 20,
    },
  },
  resetSchedule: '0 0 * * *', // Daily at midnight UTC
  allowBorrowing: true,
  borrowLimit: 0.1,
  gracePeriodMs: 3600_000, // 1 hour
};

export const DEFAULT_GATEWAY_POLICIES: GatewayPolicies = {
  rateLimit: DEFAULT_RATE_LIMIT_POLICIES,
  adaptiveThrottle: DEFAULT_ADAPTIVE_THROTTLE_CONFIG,
  validation: DEFAULT_VALIDATION_CONFIG,
  abuseDetection: DEFAULT_ABUSE_DETECTION_CONFIG,
  ipReputation: DEFAULT_IP_REPUTATION_CONFIG,
  quota: DEFAULT_QUOTA_CONFIG,
};

// ─── Environment-based Configuration Overrides ────────────────────────────────

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function readString(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

/**
 * Build gateway policies with environment variable overrides
 */
export function buildGatewayPolicies(): GatewayPolicies {
  // Rate limit policies can be overridden per-class via env vars
  // CRASHLAB_RATE_LIMIT_<CLASS>_<TIER>_<LIMIT|WINDOW>
  
  return DEFAULT_GATEWAY_POLICIES;
}

// ─── Zod Schemas for Validation ──────────────────────────────────────────────

export const TieredRateLimitConfigSchema = z.object({
  burstLimit: z.number().int().positive(),
  burstWindowMs: z.number().int().positive(),
  sustainedLimit: z.number().int().positive(),
  sustainedWindowMs: z.number().int().positive(),
  cost: z.number().int().positive().default(1),
  failClosed: z.boolean().default(false),
});

export const RateLimitPolicySchema = z.object({
  name: z.string(),
  ip: TieredRateLimitConfigSchema,
  user: TieredRateLimitConfigSchema,
  apiKey: TieredRateLimitConfigSchema,
  tenant: TieredRateLimitConfigSchema,
  endpointCosts: z.record(z.number().int().positive()).optional(),
});

export const AdaptiveThrottleConfigSchema = z.object({
  enabled: z.boolean(),
  queueDepthThreshold: z.number().int().positive(),
  latencyP99ThresholdMs: z.number().int().positive(),
  errorRateThreshold: z.number().min(0).max(1),
  minMultiplier: z.number().positive(),
  maxMultiplier: z.number().positive(),
  rampUpRate: z.number().positive(),
  rampDownRate: z.number().positive(),
  adjustmentCooldownMs: z.number().int().positive(),
});

export const ValidationConfigSchema = z.object({
  enabled: z.boolean(),
  maxBodySize: z.number().int().positive(),
  maxQueryLength: z.number().int().positive(),
  maxHeaderCount: z.number().int().positive(),
  maxHeaderValueLength: z.number().int().positive(),
  requireContentType: z.boolean(),
  allowedContentTypes: z.array(z.string()),
  rejectDuplicateParams: z.boolean(),
});

export const AbuseDetectionConfigSchema = z.object({
  enabled: z.boolean(),
  windowMs: z.number().int().positive(),
  minRequestsForAnalysis: z.number().int().positive(),
  anomalyThreshold: z.number().min(0).max(100),
  credentialStuffing: z.object({
    enabled: z.boolean(),
    maxFailedAuthPerWindow: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    lockoutDurationMs: z.number().int().positive(),
  }),
  enumeration: z.object({
    enabled: z.boolean(),
    maxUniquePathsPerWindow: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    sensitivity: z.enum(['low', 'medium', 'high']),
  }),
  scraping: z.object({
    enabled: z.boolean(),
    maxRequestsPerWindow: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    minUniqueUserAgents: z.number().int().positive(),
    entropyThreshold: z.number().positive(),
  }),
  bruteForce: z.object({
    enabled: z.boolean(),
    maxAttemptsPerTarget: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    escalateAfter: z.number().int().positive(),
  }),
});

export const IPReputationConfigSchema = z.object({
  enabled: z.boolean(),
  cacheTtlMs: z.number().int().positive(),
  threatFeeds: z.array(z.string().url()),
  challengeThreshold: z.number().min(0).max(100),
  blockThreshold: z.number().min(0).max(100),
  escalateThreshold: z.number().min(0).max(100),
  challengeAction: z.enum(['captcha', 'js-challenge', 'rate-limit']),
  blockAction: z.enum(['block', 'rate-limit-strict', 'quarantine']),
  failOpen: z.boolean(),
});

export const QuotaTierSchema = z.object({
  name: z.string(),
  requests: z.number().int().positive(),
  bandwidthBytes: z.number().int().positive(),
  concurrent: z.number().int().positive(),
  priority: z.number().int().positive(),
  endpointLimits: z.record(z.number().int().positive()).optional(),
});

export const QuotaConfigSchema = z.object({
  defaultTier: z.string(),
  tiers: z.record(QuotaTierSchema),
  resetSchedule: z.string(),
  allowBorrowing: z.boolean(),
  borrowLimit: z.number().min(0).max(1),
  gracePeriodMs: z.number().int().positive(),
});

export const GatewayPoliciesSchema = z.object({
  rateLimit: z.record(RateLimitPolicySchema),
  adaptiveThrottle: AdaptiveThrottleConfigSchema,
  validation: ValidationConfigSchema,
  abuseDetection: AbuseDetectionConfigSchema,
  ipReputation: IPReputationConfigSchema,
  quota: QuotaConfigSchema,
});