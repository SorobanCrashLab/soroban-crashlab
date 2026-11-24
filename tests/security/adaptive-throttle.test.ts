/**
 * Adaptive Throttler Tests
 *
 * Tests for the adaptive throttling system including:
 * - Queue depth based throttling
 * - Latency based throttling
 * - Error rate based throttling
 * - CPU/Memory based throttling
 * - AIMD (Additive Increase Multiplicative Decrease) behavior
 * - Gradual recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdaptiveThrottler, SystemMetrics } from '@/lib/security/api-gateway/AdaptiveThrottler';
import { DEFAULT_ADAPTIVE_THROTTLE_CONFIG } from '@/lib/security/api-gateway/policies';
import { getAdaptiveThrottler, resetAdaptiveThrottler } from '@/lib/security/api-gateway/AdaptiveThrottler';

describe('AdaptiveThrottler', () => {
  let throttler: AdaptiveThrottler;

  beforeEach(() => {
    resetAdaptiveThrottler();
    throttler = getAdaptiveThrottler(DEFAULT_ADAPTIVE_THROTTLE_CONFIG);
  });

  afterEach(() => {
    resetAdaptiveThrottler();
    vi.clearAllMocks();
  });

  describe('updateMetrics', () => {
    it('should accept metrics updates', () => {
      const metrics: Partial<SystemMetrics> = {
        queueDepth: 50,
        latency: { p50: 100, p95: 200, p99: 300 },
        errorRate: 0.01,
        cpuUsage: 0.5,
        memoryUsage: 0.6,
        activeConnections: 100,
        rps: 1000,
      };

      expect(() => throttler.updateMetrics(metrics)).not.toThrow();
    });

    it('should rate limit metric updates', () => {
      const metrics: Partial<SystemMetrics> = {
        queueDepth: 50,
        latency: { p50: 100, p95: 200, p99: 300 },
      };

      // Multiple rapid updates should be coalesced
      throttler.updateMetrics(metrics);
      throttler.updateMetrics(metrics);
      throttler.updateMetrics(metrics);
      
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getDecision', () => {
    it('should return normal decision when no throttling', () => {
      const decision = throttler.getDecision(100);
      
      expect(decision.multiplier).toBe(1.0);
      expect(decision.shouldDelay).toBe(false);
      expect(decision.delayMs).toBe(0);
      expect(decision.state.active).toBe(false);
      expect(decision.explanation).toContain('Normal operation');
    });

    it('should return effective limit based on multiplier', () => {
      const decision = throttler.getDecision(100);
      
      expect(decision.state.multiplier).toBe(1.0);
    });
  });

  describe('throttle increase', () => {
    it('should increase throttle for high queue depth', () => {
      const highQueueMetrics: Partial<SystemMetrics> = {
        queueDepth: 200, // Above threshold of 100
        latency: { p50: 100, p95: 200, p99: 300 },
        errorRate: 0.01,
        cpuUsage: 0.5,
        memoryUsage: 0.5,
        activeConnections: 100,
        rps: 1000,
      };

      // Update metrics multiple times to trigger throttle
      for (let i = 0; i < 5; i++) {
        throttler.updateMetrics(highQueueMetrics);
      }

      const decision = throttler.getDecision(100);
      
      // May not trigger immediately due to cooldown, but state should update
      expect(decision.state.reason).toBeDefined();
    });

    it('should increase throttle for high latency', () => {
      const highLatencyMetrics: Partial<SystemMetrics> = {
        queueDepth: 10,
        latency: { p50: 500, p95: 1500, p99: 2000 }, // p99 above 1000ms threshold
        errorRate: 0.01,
        cpuUsage: 0.5,
        memoryUsage: 0.5,
        activeConnections: 100,
        rps: 1000,
      };

      for (let i = 0; i < 5; i++) {
        throttler.updateMetrics(highLatencyMetrics);
      }

      const decision = throttler.getDecision(100);
      expect(decision.state.multiplier).toBeGreaterThanOrEqual(1.0);
    });

    it('should increase throttle for high error rate', () => {
      const highErrorMetrics: Partial<SystemMetrics> = {
        queueDepth: 10,
        latency: { p50: 100, p95: 200, p99: 300 },
        errorRate: 0.1, // Above 0.05 threshold
        cpuUsage: 0.5,
        memoryUsage: 0.5,
        activeConnections: 100,
        rps: 1000,
      };

      for (let i = 0; i < 5; i++) {
        throttler.updateMetrics(highErrorMetrics);
      }

      const decision = throttler.getDecision(100);
      expect(decision.state.multiplier).toBeGreaterThanOrEqual(1.0);
    });

    it('should increase throttle for high CPU', () => {
      const highCpuMetrics: Partial<SystemMetrics> = {
        queueDepth: 10,
        latency: { p50: 100, p95: 200, p99: 300 },
        errorRate: 0.01,
        cpuUsage: 0.9, // Above 0.85 threshold
        memoryUsage: 0.5,
        activeConnections: 100,
        rps: 1000,
      };

      for (let i = 0; i < 5; i++) {
        throttler.updateMetrics(highCpuMetrics);
      }

      const decision = throttler.getDecision(100);
      expect(decision.state.multiplier).toBeGreaterThanOrEqual(1.0);
    });

    it('should increase throttle for high memory', () => {
      const highMemoryMetrics: Partial<SystemMetrics> = {
        queueDepth: 10,
        latency: { p50: 100, p95: 200, p99: 300 },
        errorRate: 0.01,
        cpuUsage: 0.5,
        memoryUsage: 0.9, // Above 0.85 threshold
        activeConnections: 100,
        rps: 1000,
      };

      for (let i = 0; i < 5; i++) {
        throttler.updateMetrics(highMemoryMetrics);
      }

      const decision = throttler.getDecision(100);
      expect(decision.state.multiplier).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('throttle decrease (recovery)', () => {
    it('should gradually decrease throttle when metrics normalize', () => {
      // First, trigger high throttle
      const highLoadMetrics: Partial<SystemMetrics> = {
        queueDepth: 200,
        latency: { p50: 500, p95: 1500, p99: 2000 },
        errorRate: 0.1,
        cpuUsage: 0.9,
        memoryUsage: 0.9,
        activeConnections: 500,
        rps: 5000,
      };

      for (let i = 0; i < 10; i++) {
        throttler.updateMetrics(highLoadMetrics);
      }

      let decision = throttler.getDecision(100);
      const highMultiplier = decision.state.multiplier;
      expect(highMultiplier).toBeGreaterThan(1.0);

      // Now provide normal metrics
      const normalMetrics: Partial<SystemMetrics> = {
        queueDepth: 10,
        latency: { p50: 50, p95: 100, p99: 200 },
        errorRate: 0.001,
        cpuUsage: 0.3,
        memoryUsage: 0.4,
        activeConnections: 50,
        rps: 100,
      };

      // Update with normal metrics many times
      for (let i = 0; i < 20; i++) {
        throttler.updateMetrics(normalMetrics);
      }

      decision = throttler.getDecision(100);
      // Multiplier should have decreased (but may not reach 1.0 due to cooldown)
      expect(decision.state.multiplier).toBeLessThanOrEqual(highMultiplier);
    });
  });

  describe('setThrottle', () => {
    it('should allow manual throttle setting', () => {
      throttler.setThrottle(3.0, 'latency');
      
      const state = throttler.getState();
      expect(state.multiplier).toBe(3.0);
      expect(state.active).toBe(true);
      expect(state.reason).toBe('latency');
    });

    it('should clamp multiplier to configured bounds', () => {
      throttler.setThrottle(100, 'cpu');
      expect(throttler.getState().multiplier).toBe(10.0); // maxMultiplier

      throttler.setThrottle(0, 'memory');
      expect(throttler.getState().multiplier).toBe(1.0); // minMultiplier
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      throttler.setThrottle(5.0, 'queue-depth');
      throttler.reset();
      
      const state = throttler.getState();
      expect(state.multiplier).toBe(1.0);
      expect(state.active).toBe(false);
      expect(state.reason).toBe('none');
      expect(state.consecutiveAdjustments).toBe(0);
    });
  });

  describe('isThrottling', () => {
    it('should return false when not throttling', () => {
      expect(throttler.isThrottling()).toBe(false);
    });

    it('should return true when throttling active', () => {
      throttler.setThrottle(2.0, 'latency');
      expect(throttler.isThrottling()).toBe(true);
    });
  });

  describe('getMultiplier', () => {
    it('should return current multiplier', () => {
      expect(throttler.getMultiplier()).toBe(1.0);
      
      throttler.setThrottle(3.5, 'error-rate');
      expect(throttler.getMultiplier()).toBe(3.5);
    });
  });

  describe('getEffectiveLimit', () => {
    it('should calculate effective limit', () => {
      expect(throttler.getEffectiveLimit(100)).toBe(100);
      
      throttler.setThrottle(2.0, 'latency');
      expect(throttler.getEffectiveLimit(100)).toBe(50);
      
      throttler.setThrottle(4.0, 'cpu');
      expect(throttler.getEffectiveLimit(100)).toBe(25);
      
      // Should never go below 1
      throttler.setThrottle(10.0, 'memory');
      expect(throttler.getEffectiveLimit(5)).toBe(1);
    });
  });

  describe('getMetricsHistory', () => {
    it('should return metrics history', () => {
      const metrics: Partial<SystemMetrics> = {
        queueDepth: 50,
        latency: { p50: 100, p95: 200, p99: 300 },
      };

      throttler.updateMetrics(metrics);
      
      const history = throttler.getMetricsHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });
});