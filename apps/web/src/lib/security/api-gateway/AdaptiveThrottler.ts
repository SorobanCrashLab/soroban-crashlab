/**
 * API Gateway Hardening — Adaptive Throttler
 *
 * Dynamically adjusts rate limits based on system health signals:
 * - Request queue depth
 * - Latency percentiles (p50, p95, p99)
 * - Error rates
 * - Resource utilization (CPU, memory)
 *
 * Uses additive increase / multiplicative decrease (AIMD) for stability.
 */

import { AdaptiveThrottleConfig, DEFAULT_ADAPTIVE_THROTTLE_CONFIG } from './policies';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemMetrics {
  /** Current timestamp */
  timestamp: number;
  /** Request queue depth */
  queueDepth: number;
  /** Latency percentiles in ms */
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  /** Error rate (0-1) */
  errorRate: number;
  /** CPU utilization (0-1) */
  cpuUsage: number;
  /** Memory utilization (0-1) */
  memoryUsage: number;
  /** Active connections */
  activeConnections: number;
  /** Requests per second */
  rps: number;
}

export interface ThrottleState {
  /** Current throttle multiplier (1.0 = normal, >1.0 = throttled) */
  multiplier: number;
  /** Whether adaptive throttling is active */
  active: boolean;
  /** Reason for current throttle level */
  reason: 'queue-depth' | 'latency' | 'error-rate' | 'cpu' | 'memory' | 'none';
  /** Timestamp of last adjustment */
  lastAdjustment: number;
  /** Number of consecutive adjustments in same direction */
  consecutiveAdjustments: number;
  /** Historical metrics for trend analysis */
  history: SystemMetrics[];
}

export interface ThrottleDecision {
  /** Throttle multiplier to apply to rate limits */
  multiplier: number;
  /** Whether request should be delayed */
  shouldDelay: boolean;
  /** Delay in ms if shouldDelay */
  delayMs: number;
  /** Current throttle state */
  state: ThrottleState;
  /** Human-readable explanation */
  explanation: string;
}

// ─── AdaptiveThrottler Class ──────────────────────────────────────────────────

export class AdaptiveThrottler {
  private config: AdaptiveThrottleConfig;
  private state: ThrottleState;
  private metricsBuffer: SystemMetrics[] = [];
  private readonly maxHistorySize = 100;
  private lastMetricsUpdate = 0;
  private metricsUpdateInterval = 1000; // Minimum interval between metric updates

  constructor(config: Partial<AdaptiveThrottleConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_THROTTLE_CONFIG, ...config };
    this.state = this.initialState();
  }

  private initialState(): ThrottleState {
    return {
      multiplier: this.config.minMultiplier,
      active: false,
      reason: 'none',
      lastAdjustment: Date.now(),
      consecutiveAdjustments: 0,
      history: [],
    };
  }

  /**
   * Update system metrics (call from metrics collector)
   */
  updateMetrics(metrics: Partial<SystemMetrics>): void {
    const now = Date.now();
    
    // Rate limit metric updates
    if (now - this.lastMetricsUpdate < this.metricsUpdateInterval) {
      return;
    }
    this.lastMetricsUpdate = now;

    const fullMetrics: SystemMetrics = {
      timestamp: now,
      queueDepth: metrics.queueDepth ?? 0,
      latency: metrics.latency ?? { p50: 0, p95: 0, p99: 0 },
      errorRate: metrics.errorRate ?? 0,
      cpuUsage: metrics.cpuUsage ?? 0,
      memoryUsage: metrics.memoryUsage ?? 0,
      activeConnections: metrics.activeConnections ?? 0,
      rps: metrics.rps ?? 0,
    };

    this.metricsBuffer.push(fullMetrics);
    if (this.metricsBuffer.length > this.maxHistorySize) {
      this.metricsBuffer.shift();
    }

    // Update throttle state based on new metrics
    if (this.config.enabled) {
      this.evaluateThrottle(fullMetrics);
    }
  }

  /**
   * Evaluate whether to adjust throttle based on current metrics
   */
  private evaluateThrottle(metrics: SystemMetrics): void {
    const now = Date.now();
    const cooldown = this.config.adjustmentCooldownMs;

    // Check cooldown
    if (now - this.state.lastAdjustment < cooldown) {
      return;
    }

    let shouldThrottle = false;
    let reason: ThrottleState['reason'] = 'none';
    let targetMultiplier = this.config.minMultiplier;

    // Check queue depth
    if (metrics.queueDepth > this.config.queueDepthThreshold) {
      shouldThrottle = true;
      reason = 'queue-depth';
      const excess = metrics.queueDepth - this.config.queueDepthThreshold;
      targetMultiplier = Math.min(
        this.config.maxMultiplier,
        this.config.minMultiplier + excess * this.config.rampUpRate
      );
    }

    // Check latency (p99)
    if (metrics.latency.p99 > this.config.latencyP99ThresholdMs) {
      shouldThrottle = true;
      reason = 'latency';
      const excess = metrics.latency.p99 - this.config.latencyP99ThresholdMs;
      const latencyMultiplier = Math.min(
        this.config.maxMultiplier,
        this.config.minMultiplier + (excess / this.config.latencyP99ThresholdMs) * this.config.rampUpRate * 10
      );
      targetMultiplier = Math.max(targetMultiplier, latencyMultiplier);
    }

    // Check error rate
    if (metrics.errorRate > this.config.errorRateThreshold) {
      shouldThrottle = true;
      reason = 'error-rate';
      const excess = metrics.errorRate - this.config.errorRateThreshold;
      const errorMultiplier = Math.min(
        this.config.maxMultiplier,
        this.config.minMultiplier + (excess / this.config.errorRateThreshold) * this.config.rampUpRate * 20
      );
      targetMultiplier = Math.max(targetMultiplier, errorMultiplier);
    }

    // Check CPU
    if (metrics.cpuUsage > 0.85) {
      shouldThrottle = true;
      reason = 'cpu';
      const cpuMultiplier = Math.min(
        this.config.maxMultiplier,
        this.config.minMultiplier + (metrics.cpuUsage - 0.85) / 0.15 * this.config.rampUpRate * 10
      );
      targetMultiplier = Math.max(targetMultiplier, cpuMultiplier);
    }

    // Check memory
    if (metrics.memoryUsage > 0.85) {
      shouldThrottle = true;
      reason = 'memory';
      const memMultiplier = Math.min(
        this.config.maxMultiplier,
        this.config.minMultiplier + (metrics.memoryUsage - 0.85) / 0.15 * this.config.rampUpRate * 10
      );
      targetMultiplier = Math.max(targetMultiplier, memMultiplier);
    }

    if (shouldThrottle) {
      this.increaseThrottle(targetMultiplier, reason);
    } else {
      this.decreaseThrottle();
    }
  }

  /**
   * Increase throttle level
   */
  private increaseThrottle(targetMultiplier: number, reason: ThrottleState['reason']): void {
    const now = Date.now();
    
    // Apply multiplicative increase for stability
    const newMultiplier = Math.min(
      this.config.maxMultiplier,
      Math.max(this.state.multiplier * 1.5, targetMultiplier)
    );

    this.state = {
      ...this.state,
      multiplier: newMultiplier,
      active: true,
      reason,
      lastAdjustment: now,
      consecutiveAdjustments: this.state.reason === reason
        ? this.state.consecutiveAdjustments + 1
        : 1,
      history: [...this.state.history, this.metricsBuffer[this.metricsBuffer.length - 1]].slice(-10),
    };
  }

  /**
   * Decrease throttle level (gradual recovery)
   */
  private decreaseThrottle(): void {
    // Only decrease if we've been stable for a while
    const now = Date.now();
    const timeSinceAdjustment = now - this.state.lastAdjustment;
    
    // Require longer stability before reducing
    if (timeSinceAdjustment < this.config.adjustmentCooldownMs * 3) {
      return;
    }

    // Additive decrease
    const newMultiplier = Math.max(
      this.config.minMultiplier,
      this.state.multiplier - this.config.rampDownRate
    );

    if (newMultiplier < this.state.multiplier) {
      this.state = {
        ...this.state,
        multiplier: newMultiplier,
        active: newMultiplier > this.config.minMultiplier,
        reason: newMultiplier > this.config.minMultiplier ? this.state.reason : 'none',
        lastAdjustment: now,
        consecutiveAdjustments: 0,
      };
    }
  }

  /**
   * Get throttle decision for a request
   */
  getDecision(baseLimit: number): ThrottleDecision {
    const effectiveLimit = Math.floor(baseLimit / this.state.multiplier);
    const shouldDelay = this.state.active && this.state.multiplier > 2.0;
    
    // Add jittered delay for heavily throttled requests
    const delayMs = shouldDelay
      ? Math.floor((this.state.multiplier - 1) * 50 + Math.random() * 100)
      : 0;

    let explanation = 'Normal operation';
    if (this.state.active) {
      const reasons: Record<ThrottleState['reason'], string> = {
        'queue-depth': `Request queue depth exceeded threshold (${this.config.queueDepthThreshold})`,
        'latency': `P99 latency exceeded threshold (${this.config.latencyP99ThresholdMs}ms)`,
        'error-rate': `Error rate exceeded threshold (${this.config.errorRateThreshold * 100}%)`,
        'cpu': 'High CPU utilization (>85%)',
        'memory': 'High memory utilization (>85%)',
        'none': 'Unknown',
      };
      explanation = `Throttling active: ${reasons[this.state.reason]}. Multiplier: ${this.state.multiplier.toFixed(2)}x`;
    }

    return {
      multiplier: this.state.multiplier,
      shouldDelay,
      delayMs,
      state: { ...this.state },
      explanation,
    };
  }

  /**
   * Get current throttle state (for monitoring/debugging)
   */
  getState(): ThrottleState {
    return { ...this.state };
  }

  /**
   * Get recent metrics history
   */
  getMetricsHistory(): SystemMetrics[] {
    return [...this.metricsBuffer];
  }

  /**
   * Force throttle to a specific level (admin operation)
   */
  setThrottle(multiplier: number, reason: ThrottleState['reason'] = 'none'): void {
    this.state = {
      ...this.state,
      multiplier: Math.max(this.config.minMultiplier, Math.min(this.config.maxMultiplier, multiplier)),
      active: multiplier > this.config.minMultiplier,
      reason,
      lastAdjustment: Date.now(),
      consecutiveAdjustments: 0,
    };
  }

  /**
   * Reset throttle to minimum
   */
  reset(): void {
    this.state = this.initialState();
    this.metricsBuffer = [];
  }

  /**
   * Check if currently throttling
   */
  isThrottling(): boolean {
    return this.state.active;
  }

  /**
   * Get current multiplier
   */
  getMultiplier(): number {
    return this.state.multiplier;
  }

  /**
   * Calculate effective rate limit for a given base limit
   */
  getEffectiveLimit(baseLimit: number): number {
    return Math.max(1, Math.floor(baseLimit / this.state.multiplier));
  }
}

// ─── Metrics Collector Helper ─────────────────────────────────────────────────

export interface MetricsCollector {
  collect(): Promise<SystemMetrics>;
}

/**
 * Default metrics collector using process metrics
 */
export function createDefaultMetricsCollector(): MetricsCollector {
  let lastCpuUsage = process.cpuUsage();
  let lastTime = Date.now();
  let requestCount = 0;
  let errorCount = 0;
  let latencySum = 0;
  let latencySamples: number[] = [];

  return {
    async collect(): Promise<SystemMetrics> {
      const now = Date.now();
      const cpuUsage = process.cpuUsage(lastCpuUsage);
      lastCpuUsage = process.cpuUsage();
      
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1_000_000 / (now - lastTime) / (process.env.NODE_CPU_COUNT ?? 1);
      lastTime = now;

      const memUsage = process.memoryUsage();
      const memoryPercent = memUsage.heapUsed / memUsage.heapTotal;

      // Calculate latency percentiles
      const sortedLatencies = [...latencySamples].sort((a, b) => a - b);
      const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] ?? 0;
      const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0;
      const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] ?? 0;

      // Reset counters
      const rps = requestCount / ((now - lastTime) / 1000) || 0;
      requestCount = 0;
      errorCount = 0;
      latencySamples = [];

      return {
        timestamp: now,
        queueDepth: 0, // Would need integration with request queue
        latency: { p50, p95, p99 },
        errorRate: rps > 0 ? errorCount / (requestCount + errorCount) : 0,
        cpuUsage: Math.min(cpuPercent, 1),
        memoryUsage: memoryPercent,
        activeConnections: 0, // Would need integration
        rps,
      };
    },
  };
}

// Middleware to track request metrics
export function createMetricsMiddleware(throttler: AdaptiveThrottler) {
  const collector = createDefaultMetricsCollector();
  let collectionInterval: NodeJS.Timeout | null = null;

  return {
    start(intervalMs = 5000): void {
      if (collectionInterval) return;
      
      collectionInterval = setInterval(async () => {
        try {
          const metrics = await collector.collect();
          throttler.updateMetrics(metrics);
        } catch (error) {
          console.error('[AdaptiveThrottler] Metrics collection failed:', error);
        }
      }, intervalMs);
    },

    stop(): void {
      if (collectionInterval) {
        clearInterval(collectionInterval);
        collectionInterval = null;
      }
    },

    recordRequest(latencyMs: number, isError: boolean): void {
      // This would be called from the proxy/rate limiter
      // Implementation depends on integration point
    },
  };
}

// ─── Singleton Instance ────────────────────────────────────────────────────────

let throttlerInstance: AdaptiveThrottler | null = null;

export function getAdaptiveThrottler(config?: Partial<AdaptiveThrottleConfig>): AdaptiveThrottler {
  if (!throttlerInstance) {
    throttlerInstance = new AdaptiveThrottler(config);
  }
  return throttlerInstance;
}

export function resetAdaptiveThrottler(): void {
  throttlerInstance = null;
}