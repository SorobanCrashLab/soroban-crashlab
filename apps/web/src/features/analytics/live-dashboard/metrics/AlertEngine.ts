/** Threshold alert engine with hysteresis (#2206). */

import type { MetricSummary } from './MetricAggregator';

export type AlertState = 'healthy' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  metric: string;
  warning: number;
  critical: number;
  /** Require N consecutive evaluations before escalating. */
  consecutive?: number;
}

export interface AlertResult {
  ruleId: string;
  metric: string;
  value: number;
  state: AlertState;
  message?: string;
}

/** Evaluate rules against a metric snapshot, tracking consecutive breaches. */
export class AlertEngine {
  private readonly streaks = new Map<string, { state: AlertState; count: number }>();

  constructor(private readonly rules: AlertRule[]) {}

  evaluate(snapshot: Record<string, MetricSummary>): AlertResult[] {
    return this.rules.map((rule) => {
      const value = snapshot[rule.metric]?.current ?? 0;
      const desired: AlertState = value >= rule.critical ? 'critical' : value >= rule.warning ? 'warning' : 'healthy';
      const previous = this.streaks.get(rule.id);
      const required = rule.consecutive ?? 1;
      let state = desired;
      if (desired !== 'healthy') {
        const continuing = previous?.state === desired ? previous.count + 1 : 1;
        this.streaks.set(rule.id, { state: desired, count: continuing });
        if (continuing < required) state = previous?.state === 'critical' ? 'critical' : 'healthy';
      } else {
        this.streaks.delete(rule.id);
      }
      return {
        ruleId: rule.id,
        metric: rule.metric,
        value,
        state,
        ...(state === 'healthy' ? {} : { message: `${rule.metric} is ${state} (${value})` }),
      };
    });
  }
}
