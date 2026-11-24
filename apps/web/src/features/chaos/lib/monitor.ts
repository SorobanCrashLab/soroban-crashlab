/**
 * Live experiment telemetry and automatic halt rules (#2340).
 *
 * `ChaosTelemetrySource` is the seam for real metrics (#059/#088/#050). The
 * default source is a deterministic model of the injected faults over the
 * target baselines — same experiment, same elapsed time, same samples — so
 * halts and reports are reproducible and testable. Halt evaluation is pure
 * and independent of the source.
 */

import { faultErrorShare, faultLatencyMs } from './guardrails';
import { findTarget } from './inventory';
import type { ExperimentDefinition, HaltRule } from './model';

export const SAMPLE_INTERVAL_MS = 10_000;

export interface TelemetrySample {
  /** Offset from experiment start. */
  t: number;
  errorRate: number;
  p95LatencyMs: number;
  cpuPct: number;
  dataQuality: number;
  sloBurnRate: number;
  injectedFaults: number;
  affectedRuns: number;
  incidentOpened: boolean;
}

export interface ChaosTelemetrySource {
  samples(experimentId: string, definition: ExperimentDefinition, elapsedMs: number): TelemetrySample[];
}

const SLO_TARGET = 0.99;

function noise(seed: string, index: number): number {
  let h = 0x811c9dc5;
  const text = `${seed}:${index}`;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return (h / 0x1_0000_0000 - 0.5) * 2; // [-1, 1)
}

export const modelTelemetry: ChaosTelemetrySource = {
  samples(experimentId, definition, elapsedMs) {
    const targets = definition.targets.map(findTarget).filter((target) => target !== null);
    const count = targets.length || 1;
    const baseline = {
      errorRate: targets.reduce((sum, target) => sum + target.baseline.errorRate, 0) / count || 0.01,
      p95: targets.reduce((sum, target) => sum + target.baseline.p95LatencyMs, 0) / count || 200,
      cpu: targets.reduce((sum, target) => sum + target.baseline.cpuPct, 0) / count || 30,
      quality: targets.reduce((sum, target) => sum + target.baseline.dataQuality, 0) / count || 0.99,
    };
    const throughput = targets.reduce((sum, target) => sum + target.throughputPerHour, 0);
    const errorShare = Math.min(1, definition.faults.reduce((sum, fault) => sum + faultErrorShare(fault), 0));
    const latency = definition.faults.reduce((sum, fault) => sum + faultLatencyMs(fault), 0);
    const cpuFault = definition.faults.find((fault) => fault.type === 'cpu-pressure');
    const memoryFault = definition.faults.find((fault) => fault.type === 'memory-pressure');
    const durationMs = definition.durationSec * 1_000;
    const out: TelemetrySample[] = [];
    let breachStreak = 0;
    for (let t = 0; t <= Math.min(elapsedMs, durationMs); t += SAMPLE_INTERVAL_MS) {
      const index = t / SAMPLE_INTERVAL_MS;
      // Faults ramp in over ~30 s (injection propagates gradually).
      const ramp = 1 - Math.exp(-t / 15_000);
      const jitter = noise(experimentId, index);
      const errorRate = Math.max(0, Math.min(1, baseline.errorRate + errorShare * ramp * (1 + 0.1 * jitter)));
      const p95 = Math.max(1, baseline.p95 + latency * ramp * (1 + 0.15 * jitter));
      const cpu = Math.min(100, baseline.cpu + (cpuFault ? (cpuFault.cpuPercent - baseline.cpu) * ramp : 0) + (memoryFault ? 5 * ramp : 0) + 2 * jitter);
      const quality = Math.max(0, Math.min(1, baseline.quality - errorShare * 0.3 * ramp - (cpu > 90 ? 0.05 : 0)));
      breachStreak = errorRate > 0.25 ? breachStreak + 1 : 0;
      out.push({
        t,
        errorRate: Math.round(errorRate * 10_000) / 10_000,
        p95LatencyMs: Math.round(p95),
        cpuPct: Math.round(cpu * 10) / 10,
        dataQuality: Math.round(quality * 10_000) / 10_000,
        sloBurnRate: Math.round((errorRate / (1 - SLO_TARGET)) * 100) / 100,
        injectedFaults: Math.round(((throughput * t) / 3_600_000) * errorShare * 10) + (latency > 0 ? Math.round((throughput * t) / 3_600_000) : 0),
        affectedRuns: Math.round((throughput * t) / 3_600_000),
        // Simulated incident trigger (#066): sustained error rate above 25%.
        incidentOpened: breachStreak >= 3,
      });
    }
    return out;
  },
};

export function metricValue(sample: TelemetrySample, metric: HaltRule['metric']): number {
  switch (metric) {
    case 'error_rate':
      return sample.errorRate;
    case 'p95_latency_ms':
      return sample.p95LatencyMs;
    case 'slo_burn_rate':
      return sample.sloBurnRate;
    case 'data_quality_score':
      return sample.dataQuality;
    case 'incident_opened':
      return sample.incidentOpened ? 1 : 0;
  }
}

export function breaches(sample: TelemetrySample, rule: HaltRule): boolean {
  const value = metricValue(sample, rule.metric);
  return rule.comparator === 'gt' ? value > rule.threshold : value < rule.threshold;
}

export interface HaltEvaluation {
  rule: HaltRule;
  /** Sample at which the rule fired (end of the breaching streak). */
  sample: TelemetrySample;
}

/** Earliest sample at which any rule has breached for `forSamples` consecutive samples. */
export function evaluateHaltRules(samples: readonly TelemetrySample[], rules: readonly HaltRule[]): HaltEvaluation | null {
  const streaks = rules.map(() => 0);
  for (const sample of samples) {
    for (let index = 0; index < rules.length; index += 1) {
      streaks[index] = breaches(sample, rules[index]) ? streaks[index] + 1 : 0;
      if (streaks[index] >= rules[index].forSamples) return { rule: rules[index], sample };
    }
  }
  return null;
}
