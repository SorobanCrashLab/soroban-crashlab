import type { FuzzingRun, RunStatus } from './types';
import type {
  AlertCategory,
  AlertChannel,
  AlertCondition,
  AlertRule,
  AlertSeverity,
} from './alerting-settings-page-utils';

export type DryRunOutcome = 'would-trigger' | 'no-match' | 'cooldown-blocked';

export interface DryRunAlertResult {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  category: AlertCategory;
  outcome: DryRunOutcome;
  matchedCondition: AlertCondition;
  matchedValue: number;
  threshold: number;
  unit: string;
  channels: AlertChannel[];
  detail: string;
}

export interface AlertDispatchSink {
  dispatch(
    rule: AlertRule,
    detail: string,
    matchedValue: number,
  ): void;
}

export class DryRunDispatchSink implements AlertDispatchSink {
  readonly results: DryRunAlertResult[] = [];

  dispatch(
    rule: AlertRule,
    detail: string,
    matchedValue: number,
  ): void {
    this.results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      category: rule.category,
      outcome: 'would-trigger',
      matchedCondition: rule.condition,
      matchedValue,
      threshold: rule.threshold,
      unit: rule.unit,
      channels: [...rule.channels],
      detail,
    });
  }
}

export class NoopDispatchSink implements AlertDispatchSink {
  dispatch(): void {
    // intentionally empty
  }
}

export type RunStatusGroup = Record<RunStatus, number>;

function countStatuses(runs: FuzzingRun[]): RunStatusGroup {
  const counts: RunStatusGroup = {
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const run of runs) {
    counts[run.status] += 1;
  }
  return counts;
}

function failurePercentage(runs: FuzzingRun[]): number {
  if (runs.length === 0) return 0;
  const failed = runs.filter((r) => r.status === 'failed').length;
  return (failed / runs.length) * 100;
}

function consecutiveFailures(runs: FuzzingRun[]): number {
  let count = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].status === 'failed') {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function trendDirection(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  let up = 0;
  let down = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
    else if (values[i] < values[i - 1]) down++;
  }
  if (up > down) return 'up';
  if (down > up) return 'down';
  return 'flat';
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function computeMemoryValues(runs: FuzzingRun[]): number[] {
  return runs.map((r) => r.memoryBytes);
}

function computeDurationValues(runs: FuzzingRun[]): number[] {
  return runs.map((r) => r.duration);
}

function isInsideCooldown(
  rule: AlertRule,
  referenceTime: Date,
): boolean {
  if (!rule.lastTriggered) return false;
  const lastTriggered = Date.parse(rule.lastTriggered);
  if (Number.isNaN(lastTriggered)) return false;
  const cooldownMs = rule.cooldown * 60 * 1000;
  return referenceTime.getTime() - lastTriggered < cooldownMs;
}

interface EvaluateInput {
  rule: AlertRule;
  runs: FuzzingRun[];
  referenceTime: Date;
}

function evaluateThreshold(input: EvaluateInput): { matched: boolean; value: number; detail: string } {
  const { rule, runs } = input;
  const counts = countStatuses(runs);
  const total = runs.length;
  const failed = counts.failed;

  const value = failurePercentage(runs);
  const matched = value >= rule.threshold;

  const detail = matched
    ? `${failed}/${total} runs failed (${value.toFixed(1)}% >= ${rule.threshold}% threshold)`
    : `${failed}/${total} runs failed (${value.toFixed(1)}% < ${rule.threshold}% threshold)`;

  return { matched, value, detail };
}

function evaluateConsecutive(input: EvaluateInput): { matched: boolean; value: number; detail: string } {
  const { rule, runs } = input;
  const value = consecutiveFailures(runs);
  const matched = value >= rule.threshold;

  const detail = matched
    ? `${value} consecutive failures (>= ${rule.threshold} threshold)`
    : `${value} consecutive failures (< ${rule.threshold} threshold)`;

  return { matched, value, detail };
}

function evaluateAnomaly(input: EvaluateInput): { matched: boolean; value: number; detail: string } {
  const { rule, runs } = input;
  const memoryValues = computeMemoryValues(runs);
  const stdDev = standardDeviation(memoryValues);
  const avg = mean(memoryValues);
  const latest = memoryValues[memoryValues.length - 1] ?? 0;
  const zScore = stdDev > 0 ? (latest - avg) / stdDev : 0;
  const matched = Math.abs(zScore) >= rule.threshold;

  const detail = matched
    ? `z-score ${zScore.toFixed(2)} (|z| >= ${rule.threshold} threshold)`
    : `z-score ${zScore.toFixed(2)} (|z| < ${rule.threshold} threshold)`;

  return { matched, value: Math.abs(zScore), detail };
}

function evaluateTrend(input: EvaluateInput): { matched: boolean; value: number; detail: string } {
  const { rule, runs } = input;
  const durationValues = computeDurationValues(runs);
  const dir = trendDirection(durationValues);
  const avgDuration = mean(durationValues);
  const latest = durationValues[durationValues.length - 1] ?? 0;
  const deviationFromAvg = avgDuration > 0 ? ((latest - avgDuration) / avgDuration) * 100 : 0;
  const matched = dir === 'up' && Math.abs(deviationFromAvg) >= rule.threshold;

  const detail = matched
    ? `trend ${dir} (${deviationFromAvg.toFixed(1)}% deviation >= ${rule.threshold}%)`
    : `trend ${dir} (${deviationFromAvg.toFixed(1)}% deviation < ${rule.threshold}%)`;

  return { matched, value: Math.abs(deviationFromAvg), detail };
}

export function evaluateRule(input: EvaluateInput): DryRunAlertResult | null {
  const { rule, runs, referenceTime } = input;

  if (!rule.enabled) return null;
  if (runs.length === 0) return null;

  if (isInsideCooldown(rule, referenceTime)) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      category: rule.category,
      outcome: 'cooldown-blocked',
      matchedCondition: rule.condition,
      matchedValue: 0,
      threshold: rule.threshold,
      unit: rule.unit,
      channels: [...rule.channels],
      detail: `Rule is in cooldown window (${rule.cooldown}m)`,
    };
  }

  let evaluation: { matched: boolean; value: number; detail: string };

  switch (rule.condition) {
    case 'threshold':
      evaluation = evaluateThreshold(input);
      break;
    case 'consecutive':
      evaluation = evaluateConsecutive(input);
      break;
    case 'anomaly':
      evaluation = evaluateAnomaly(input);
      break;
    case 'trend':
      evaluation = evaluateTrend(input);
      break;
    default:
      return null;
  }

  if (!evaluation.matched) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      category: rule.category,
      outcome: 'no-match',
      matchedCondition: rule.condition,
      matchedValue: evaluation.value,
      threshold: rule.threshold,
      unit: rule.unit,
      channels: [...rule.channels],
      detail: evaluation.detail,
    };
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    category: rule.category,
    outcome: 'would-trigger',
    matchedCondition: rule.condition,
    matchedValue: evaluation.value,
    threshold: rule.threshold,
    unit: rule.unit,
    channels: [...rule.channels],
    detail: evaluation.detail,
  };
}

export function evaluateRules(
  rules: AlertRule[],
  runs: FuzzingRun[],
  referenceTime: Date,
): DryRunAlertResult[] {
  const results: DryRunAlertResult[] = [];

  for (const rule of rules) {
    const result = evaluateRule({ rule, runs, referenceTime });
    if (result !== null) {
      results.push(result);
    }
  }

  return results;
}

export function dispatchEvaluateRules(
  rules: AlertRule[],
  runs: FuzzingRun[],
  referenceTime: Date,
  sink: AlertDispatchSink,
): void {
  for (const rule of rules) {
    if (!rule.enabled || runs.length === 0) continue;

    if (isInsideCooldown(rule, referenceTime)) continue;

    let evaluation: { matched: boolean; value: number; detail: string };

    switch (rule.condition) {
      case 'threshold':
        evaluation = evaluateThreshold({ rule, runs, referenceTime });
        break;
      case 'consecutive':
        evaluation = evaluateConsecutive({ rule, runs, referenceTime });
        break;
      case 'anomaly':
        evaluation = evaluateAnomaly({ rule, runs, referenceTime });
        break;
      case 'trend':
        evaluation = evaluateTrend({ rule, runs, referenceTime });
        break;
      default:
        continue;
    }

    if (evaluation.matched) {
      sink.dispatch(rule, evaluation.detail, evaluation.value);
    }
  }
}
