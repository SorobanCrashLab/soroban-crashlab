import * as assert from 'node:assert/strict';
import {
  DryRunDispatchSink,
  NoopDispatchSink,
  evaluateRule,
  evaluateRules,
  dispatchEvaluateRules,
} from './alerting-evaluator';
import type { FuzzingRun } from './types';
import type { AlertRule } from './alerting-settings-page-utils';

const referenceTime = new Date('2026-08-25T12:00:00.000Z');

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: overrides.id ?? `run-${Math.random().toString(36).slice(2, 8)}`,
    status: overrides.status ?? 'completed',
    area: overrides.area ?? 'auth',
    severity: overrides.severity ?? 'low',
    duration: overrides.duration ?? 1000,
    seedCount: overrides.seedCount ?? 100,
    crashDetail: overrides.crashDetail ?? null,
    cpuInstructions: overrides.cpuInstructions ?? 50000,
    memoryBytes: overrides.memoryBytes ?? 1024 * 1024,
    minResourceFee: overrides.minResourceFee ?? 100,
    queuedAt: overrides.queuedAt,
    startedAt: overrides.startedAt,
    finishedAt: overrides.finishedAt,
  };
}

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: overrides.id ?? 'test-rule',
    name: overrides.name ?? 'Test Rule',
    description: overrides.description ?? 'A test rule',
    category: overrides.category ?? 'reliability',
    enabled: overrides.enabled ?? true,
    severity: overrides.severity ?? 'high',
    condition: overrides.condition ?? 'threshold',
    threshold: overrides.threshold ?? 15,
    unit: overrides.unit ?? '%',
    channels: overrides.channels ?? ['email'],
    cooldown: overrides.cooldown ?? 30,
    tags: overrides.tags ?? ['test'],
    createdAt: overrides.createdAt ?? '2026-08-01T00:00:00.000Z',
    lastTriggered: overrides.lastTriggered,
  };
}

// ---------------------------------------------------------------------------
// Threshold condition
// ---------------------------------------------------------------------------

function testThresholdTriggerWhenAbove(): void {
  const runs = [
    makeRun({ status: 'failed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'completed' }),
  ];
  const rule = makeRule({ condition: 'threshold', threshold: 50 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
  assert.ok(result.detail.includes('66.7%'));
}

function testThresholdNoMatchWhenBelow(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
  ];
  const rule = makeRule({ condition: 'threshold', threshold: 50 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

function testThresholdExactlyAtBoundary(): void {
  const runs = Array.from({ length: 10 }, (_, i) =>
    makeRun({ status: i < 5 ? 'failed' : 'completed' }),
  );
  const rule = makeRule({ condition: 'threshold', threshold: 50 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
}

function testThresholdEmptyRunsReturnsNull(): void {
  const rule = makeRule({ condition: 'threshold', threshold: 10 });
  const result = evaluateRule({ rule, runs: [], referenceTime });
  assert.equal(result, null);
}

function testThresholdAllCompleted(): void {
  const runs = [makeRun({ status: 'completed' }), makeRun({ status: 'completed' })];
  const rule = makeRule({ condition: 'threshold', threshold: 10 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
  assert.equal(result.matchedValue, 0);
}

// ---------------------------------------------------------------------------
// Consecutive condition
// ---------------------------------------------------------------------------

function testConsecutiveTriggerAtThreshold(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'failed' }),
  ];
  const rule = makeRule({ condition: 'consecutive', threshold: 3 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
  assert.equal(result.matchedValue, 3);
}

function testConsecutiveNoMatchBelowThreshold(): void {
  const runs = [
    makeRun({ status: 'failed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'failed' }),
  ];
  const rule = makeRule({ condition: 'consecutive', threshold: 3 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
  assert.equal(result.matchedValue, 2);
}

function testConsecutiveAllFailed(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rule = makeRule({ condition: 'consecutive', threshold: 5 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
  assert.equal(result.matchedValue, 5);
}

function testConsecutiveZeroFailures(): void {
  const runs = [makeRun({ status: 'completed' }), makeRun({ status: 'running' })];
  const rule = makeRule({ condition: 'consecutive', threshold: 1 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
  assert.equal(result.matchedValue, 0);
}

// ---------------------------------------------------------------------------
// Anomaly condition
// ---------------------------------------------------------------------------

function testAnomalyTriggersOnHighZScore(): void {
  const baseline = Array.from({ length: 10 }, () =>
    makeRun({ memoryBytes: 1024 * 1024 }),
  );
  const outlier = makeRun({ memoryBytes: 10 * 1024 * 1024 });
  const runs = [...baseline, outlier];
  const rule = makeRule({ condition: 'anomaly', threshold: 2.0 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
}

function testAnomalyNoMatchOnConsistentData(): void {
  const runs = Array.from({ length: 10 }, () =>
    makeRun({ memoryBytes: 1024 * 1024 }),
  );
  const rule = makeRule({ condition: 'anomaly', threshold: 2.5 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

function testAnomalySingleRun(): void {
  const runs = [makeRun({ memoryBytes: 1024 * 1024 })];
  const rule = makeRule({ condition: 'anomaly', threshold: 2.0 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

function testAnomalyTwoRuns(): void {
  const runs = [
    makeRun({ memoryBytes: 1024 * 1024 }),
    makeRun({ memoryBytes: 5 * 1024 * 1024 }),
  ];
  const rule = makeRule({ condition: 'anomaly', threshold: 0.5 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
}

// ---------------------------------------------------------------------------
// Trend condition
// ---------------------------------------------------------------------------

function testTrendTriggerOnUpwardTrend(): void {
  const runs = [
    makeRun({ duration: 100 }),
    makeRun({ duration: 200 }),
    makeRun({ duration: 400 }),
    makeRun({ duration: 800 }),
  ];
  const rule = makeRule({ condition: 'trend', threshold: 25 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
}

function testTrendNoMatchOnFlatData(): void {
  const runs = [
    makeRun({ duration: 100 }),
    makeRun({ duration: 100 }),
    makeRun({ duration: 100 }),
  ];
  const rule = makeRule({ condition: 'trend', threshold: 25 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

function testTrendNoMatchOnDownwardTrend(): void {
  const runs = [
    makeRun({ duration: 800 }),
    makeRun({ duration: 400 }),
    makeRun({ duration: 200 }),
    makeRun({ duration: 100 }),
  ];
  const rule = makeRule({ condition: 'trend', threshold: 25 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

function testTrendSingleRun(): void {
  const runs = [makeRun({ duration: 100 })];
  const rule = makeRule({ condition: 'trend', threshold: 10 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'no-match');
}

// ---------------------------------------------------------------------------
// Disabled rules
// ---------------------------------------------------------------------------

function testDisabledRuleReturnsNull(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rule = makeRule({ enabled: false, condition: 'threshold', threshold: 10 });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.equal(result, null);
}

// ---------------------------------------------------------------------------
// Cooldown blocking
// ---------------------------------------------------------------------------

function testCooldownBlocksTrigger(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rule = makeRule({
    condition: 'threshold',
    threshold: 10,
    cooldown: 60,
    lastTriggered: '2026-08-25T11:30:00.000Z',
  });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'cooldown-blocked');
  assert.ok(result.detail.includes('cooldown'));
}

function testCooldownExpiredAllowsTrigger(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rule = makeRule({
    condition: 'threshold',
    threshold: 10,
    cooldown: 30,
    lastTriggered: '2026-08-25T10:00:00.000Z',
  });
  const result = evaluateRule({ rule, runs, referenceTime });
  assert.ok(result);
  assert.equal(result.outcome, 'would-trigger');
}

// ---------------------------------------------------------------------------
// evaluateRules (batch)
// ---------------------------------------------------------------------------

function testEvaluateRulesReturnsAllResults(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [
    makeRule({ id: 'r1', condition: 'threshold', threshold: 10 }),
    makeRule({ id: 'r2', condition: 'consecutive', threshold: 3 }),
    makeRule({ id: 'r3', enabled: false }),
  ];
  const results = evaluateRules(rules, runs, referenceTime);
  assert.equal(results.length, 2, 'disabled rule excluded');
  assert.equal(results[0].ruleId, 'r1');
  assert.equal(results[1].ruleId, 'r2');
}

function testEvaluateRulesEmptyRuns(): void {
  const rules = [makeRule({ condition: 'threshold', threshold: 10 })];
  const results = evaluateRules(rules, [], referenceTime);
  assert.equal(results.length, 0);
}

function testEvaluateRulesAllDisabled(): void {
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [
    makeRule({ enabled: false }),
    makeRule({ enabled: false }),
  ];
  const results = evaluateRules(rules, runs, referenceTime);
  assert.equal(results.length, 0);
}

// ---------------------------------------------------------------------------
// DryRunDispatchSink
// ---------------------------------------------------------------------------

function testDryRunSinkCollectsTriggeredResults(): void {
  const sink = new DryRunDispatchSink();
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [
    makeRule({ id: 'r1', condition: 'threshold', threshold: 10 }),
    makeRule({ id: 'r2', condition: 'consecutive', threshold: 3 }),
  ];
  dispatchEvaluateRules(rules, runs, referenceTime, sink);
  assert.equal(sink.results.length, 2);
  assert.equal(sink.results[0].outcome, 'would-trigger');
  assert.equal(sink.results[1].outcome, 'would-trigger');
}

function testDryRunSinkOnlyCollectsTriggeredNotNoMatch(): void {
  const sink = new DryRunDispatchSink();
  const runs = [makeRun({ status: 'completed' }), makeRun({ status: 'completed' })];
  const rules = [
    makeRule({ id: 'r1', condition: 'threshold', threshold: 50 }),
  ];
  dispatchEvaluateRules(rules, runs, referenceTime, sink);
  assert.equal(sink.results.length, 0, 'no-match rules are not dispatched');
}

function testDryRunSinkRespectsCooldown(): void {
  const sink = new DryRunDispatchSink();
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [
    makeRule({
      condition: 'threshold',
      threshold: 10,
      cooldown: 60,
      lastTriggered: '2026-08-25T11:30:00.000Z',
    }),
  ];
  dispatchEvaluateRules(rules, runs, referenceTime, sink);
  assert.equal(sink.results.length, 0, 'cooldown blocks dispatch');
}

function testDryRunSinkChannelsCopied(): void {
  const sink = new DryRunDispatchSink();
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rule = makeRule({
    condition: 'threshold',
    threshold: 10,
    channels: ['email', 'slack'],
  });
  dispatchEvaluateRules([rule], runs, referenceTime, sink);
  assert.equal(sink.results.length, 1);
  assert.deepEqual(sink.results[0].channels, ['email', 'slack']);
}

// ---------------------------------------------------------------------------
// NoopDispatchSink
// ---------------------------------------------------------------------------

function testNoopSinkDoesNotCollect(): void {
  const sink = new NoopDispatchSink();
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [makeRule({ condition: 'threshold', threshold: 10 })];
  dispatchEvaluateRules(rules, runs, referenceTime, sink);
  // No assertion needed — just verify it doesn't throw
  assert.ok(true);
}

// ---------------------------------------------------------------------------
// dispatchEvaluateRules edge cases
// ---------------------------------------------------------------------------

function testDispatchSkipsDisabledRules(): void {
  const sink = new DryRunDispatchSink();
  const runs = Array.from({ length: 5 }, () => makeRun({ status: 'failed' }));
  const rules = [makeRule({ enabled: false, condition: 'threshold', threshold: 10 })];
  dispatchEvaluateRules(rules, runs, referenceTime, sink);
  assert.equal(sink.results.length, 0);
}

function testDispatchSkipsEmptyRuns(): void {
  const sink = new DryRunDispatchSink();
  const rules = [makeRule({ condition: 'threshold', threshold: 10 })];
  dispatchEvaluateRules(rules, [], referenceTime, sink);
  assert.equal(sink.results.length, 0);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testThresholdTriggerWhenAbove();
testThresholdNoMatchWhenBelow();
testThresholdExactlyAtBoundary();
testThresholdEmptyRunsReturnsNull();
testThresholdAllCompleted();
testConsecutiveTriggerAtThreshold();
testConsecutiveNoMatchBelowThreshold();
testConsecutiveAllFailed();
testConsecutiveZeroFailures();
testAnomalyTriggersOnHighZScore();
testAnomalyNoMatchOnConsistentData();
testAnomalySingleRun();
testAnomalyTwoRuns();
testTrendTriggerOnUpwardTrend();
testTrendNoMatchOnFlatData();
testTrendNoMatchOnDownwardTrend();
testTrendSingleRun();
testDisabledRuleReturnsNull();
testCooldownBlocksTrigger();
testCooldownExpiredAllowsTrigger();
testEvaluateRulesReturnsAllResults();
testEvaluateRulesEmptyRuns();
testEvaluateRulesAllDisabled();
testDryRunSinkCollectsTriggeredResults();
testDryRunSinkOnlyCollectsTriggeredNotNoMatch();
testDryRunSinkRespectsCooldown();
testDryRunSinkChannelsCopied();
testNoopSinkDoesNotCollect();
testDispatchSkipsDisabledRules();
testDispatchSkipsEmptyRuns();

console.log('alerting-evaluator.test.ts: all assertions passed');
