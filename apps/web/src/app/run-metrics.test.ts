import * as assert from 'node:assert/strict';
import {
  countByStatus,
  countBySeverity,
  avgField,
  maxField,
  sumField,
  avgDuration,
  avgSeeds,
  avgCpu,
  avgMemory,
  avgFee,
  maxCpu,
  maxMemory,
  maxFee,
  failureRate,
  successRate,
  criticalCount,
  totalCrashes,
  filterByStatus,
  filterByStatuses,
  filterBySeverity,
  filterNonCancelled,
  filterWithCrash,
  deltaPercent,
  classifyDelta,
  formatDuration,
  formatBytes,
  formatFee,
  formatNumber,
  buildAggregateMetrics,
} from './run-metrics';
import type { FuzzingRun } from './types';

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
  };
}

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------

function testCountByStatusEmpty(): void {
  const counts = countByStatus([]);
  assert.equal(counts.running, 0);
  assert.equal(counts.completed, 0);
  assert.equal(counts.failed, 0);
  assert.equal(counts.cancelled, 0);
}

function testCountByStatusMixed(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'running' }),
    makeRun({ status: 'cancelled' }),
  ];
  const counts = countByStatus(runs);
  assert.equal(counts.completed, 2);
  assert.equal(counts.failed, 1);
  assert.equal(counts.running, 1);
  assert.equal(counts.cancelled, 1);
}

// ---------------------------------------------------------------------------
// countBySeverity
// ---------------------------------------------------------------------------

function testCountBySeverityEmpty(): void {
  const counts = countBySeverity([]);
  assert.equal(counts.low, 0);
  assert.equal(counts.critical, 0);
}

function testCountBySeverityMixed(): void {
  const runs = [
    makeRun({ severity: 'critical' }),
    makeRun({ severity: 'critical' }),
    makeRun({ severity: 'high' }),
    makeRun({ severity: 'low' }),
  ];
  const counts = countBySeverity(runs);
  assert.equal(counts.critical, 2);
  assert.equal(counts.high, 1);
  assert.equal(counts.low, 1);
  assert.equal(counts.medium, 0);
}

// ---------------------------------------------------------------------------
// avgField
// ---------------------------------------------------------------------------

function testAvgFieldEmpty(): void {
  assert.equal(avgField([], 'duration'), 0);
  assert.equal(avgField([], 'cpuInstructions'), 0);
}

function testAvgFieldSingleRun(): void {
  const runs = [makeRun({ duration: 500 })];
  assert.equal(avgField(runs, 'duration'), 500);
}

function testAvgFieldMultipleRuns(): void {
  const runs = [
    makeRun({ duration: 100 }),
    makeRun({ duration: 200 }),
    makeRun({ duration: 300 }),
  ];
  assert.equal(avgField(runs, 'duration'), 200);
}

// ---------------------------------------------------------------------------
// maxField
// ---------------------------------------------------------------------------

function testMaxFieldEmpty(): void {
  assert.equal(maxField([], 'cpuInstructions'), 0);
}

function testMaxFieldSingleRun(): void {
  const runs = [makeRun({ memoryBytes: 5000 })];
  assert.equal(maxField(runs, 'memoryBytes'), 5000);
}

function testMaxFieldMultipleRuns(): void {
  const runs = [
    makeRun({ minResourceFee: 100 }),
    makeRun({ minResourceFee: 500 }),
    makeRun({ minResourceFee: 300 }),
  ];
  assert.equal(maxField(runs, 'minResourceFee'), 500);
}

// ---------------------------------------------------------------------------
// sumField
// ---------------------------------------------------------------------------

function testSumFieldEmpty(): void {
  assert.equal(sumField([], 'duration'), 0);
}

function testSumFieldMultipleRuns(): void {
  const runs = [
    makeRun({ seedCount: 10 }),
    makeRun({ seedCount: 20 }),
    makeRun({ seedCount: 30 }),
  ];
  assert.equal(sumField(runs, 'seedCount'), 60);
}

// ---------------------------------------------------------------------------
// Convenience averages
// ---------------------------------------------------------------------------

function testAvgDuration(): void {
  const runs = [
    makeRun({ duration: 1000 }),
    makeRun({ duration: 3000 }),
  ];
  assert.equal(avgDuration(runs), 2000);
}

function testAvgDurationEmpty(): void {
  assert.equal(avgDuration([]), 0);
}

function testAvgSeeds(): void {
  const runs = [
    makeRun({ seedCount: 50 }),
    makeRun({ seedCount: 150 }),
  ];
  assert.equal(avgSeeds(runs), 100);
}

function testAvgCpuRounded(): void {
  const runs = [
    makeRun({ cpuInstructions: 100000 }),
    makeRun({ cpuInstructions: 200001 }),
  ];
  assert.equal(avgCpu(runs), 150001);
}

function testAvgMemoryRounded(): void {
  const runs = [
    makeRun({ memoryBytes: 1000000 }),
    makeRun({ memoryBytes: 2000000 }),
  ];
  assert.equal(avgMemory(runs), 1500000);
}

function testAvgFeeRounded(): void {
  const runs = [
    makeRun({ minResourceFee: 100 }),
    makeRun({ minResourceFee: 201 }),
  ];
  assert.equal(avgFee(runs), 151);
}

// ---------------------------------------------------------------------------
// Maxima
// ---------------------------------------------------------------------------

function testMaxCpu(): void {
  const runs = [
    makeRun({ cpuInstructions: 500 }),
    makeRun({ cpuInstructions: 1000 }),
    makeRun({ cpuInstructions: 750 }),
  ];
  assert.equal(maxCpu(runs), 1000);
}

function testMaxMemory(): void {
  const runs = [
    makeRun({ memoryBytes: 1024 }),
    makeRun({ memoryBytes: 4096 }),
  ];
  assert.equal(maxMemory(runs), 4096);
}

function testMaxFee(): void {
  const runs = [
    makeRun({ minResourceFee: 10 }),
    makeRun({ minResourceFee: 999 }),
  ];
  assert.equal(maxFee(runs), 999);
}

function testMaxCpuEmpty(): void {
  assert.equal(maxCpu([]), 0);
}

// ---------------------------------------------------------------------------
// failureRate / successRate
// ---------------------------------------------------------------------------

function testFailureRateEmpty(): void {
  assert.equal(failureRate([]), 0);
}

function testFailureRateAllFailed(): void {
  const runs = [makeRun({ status: 'failed' }), makeRun({ status: 'failed' })];
  assert.equal(failureRate(runs), 100);
}

function testFailureRateMixed(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
  ];
  assert.ok(Math.abs(failureRate(runs) - 33.333) < 0.01);
}

function testSuccessRateEmpty(): void {
  assert.equal(successRate([]), 0);
}

function testSuccessRateAllCompleted(): void {
  const runs = [makeRun({ status: 'completed' }), makeRun({ status: 'completed' })];
  assert.equal(successRate(runs), 100);
}

function testSuccessRateMixed(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'running' }),
  ];
  assert.ok(Math.abs(successRate(runs) - 33.333) < 0.01);
}

// ---------------------------------------------------------------------------
// criticalCount / totalCrashes
// ---------------------------------------------------------------------------

function testCriticalCountEmpty(): void {
  assert.equal(criticalCount([]), 0);
}

function testCriticalCount(): void {
  const runs = [
    makeRun({ severity: 'critical' }),
    makeRun({ severity: 'high' }),
    makeRun({ severity: 'critical' }),
  ];
  assert.equal(criticalCount(runs), 2);
}

function testTotalCrashesEmpty(): void {
  assert.equal(totalCrashes([]), 0);
}

function testTotalCrashes(): void {
  const runs = [
    makeRun({ crashDetail: null }),
    makeRun({ crashDetail: { failureCategory: 'auth', signature: 's1', payload: 'p', replayAction: 'r' } }),
    makeRun({ crashDetail: { failureCategory: 'budget', signature: 's2', payload: 'p', replayAction: 'r' } }),
    makeRun({ crashDetail: null }),
  ];
  assert.equal(totalCrashes(runs), 2);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function testFilterByStatus(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'completed' }),
  ];
  const result = filterByStatus(runs, 'failed');
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'failed');
}

function testFilterByStatusEmpty(): void {
  assert.deepEqual(filterByStatus([], 'completed'), []);
}

function testFilterByStatuses(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'running' }),
    makeRun({ status: 'completed' }),
  ];
  const result = filterByStatuses(runs, ['completed', 'failed']);
  assert.equal(result.length, 3);
}

function testFilterBySeverity(): void {
  const runs = [
    makeRun({ severity: 'critical' }),
    makeRun({ severity: 'low' }),
    makeRun({ severity: 'critical' }),
  ];
  const result = filterBySeverity(runs, 'critical');
  assert.equal(result.length, 2);
}

function testFilterNonCancelled(): void {
  const runs = [
    makeRun({ status: 'completed' }),
    makeRun({ status: 'cancelled' }),
    makeRun({ status: 'failed' }),
    makeRun({ status: 'cancelled' }),
  ];
  const result = filterNonCancelled(runs);
  assert.equal(result.length, 2);
  result.forEach((r) => assert.notEqual(r.status, 'cancelled'));
}

function testFilterWithCrash(): void {
  const runs = [
    makeRun({ crashDetail: null }),
    makeRun({ crashDetail: { failureCategory: 'x', signature: 'y', payload: 'z', replayAction: 'r' } }),
  ];
  const result = filterWithCrash(runs);
  assert.equal(result.length, 1);
}

// ---------------------------------------------------------------------------
// deltaPercent
// ---------------------------------------------------------------------------

function testDeltaPercentZeroBaseline(): void {
  assert.equal(deltaPercent(0, 100), 0);
}

function testDeltaPercentPositive(): void {
  assert.equal(deltaPercent(100, 150), 50);
}

function testDeltaPercentNegative(): void {
  assert.equal(deltaPercent(100, 50), -50);
}

function testDeltaPercentEqual(): void {
  assert.equal(deltaPercent(100, 100), 0);
}

function testDeltaPercentLargeValues(): void {
  const result = deltaPercent(1_000_000, 1_500_000);
  assert.equal(result, 50);
}

// ---------------------------------------------------------------------------
// classifyDelta
// ---------------------------------------------------------------------------

function testClassifyDeltaStableLowerIsBetter(): void {
  assert.equal(classifyDelta(5, true), 'stable');
  assert.equal(classifyDelta(-5, true), 'stable');
  assert.equal(classifyDelta(0, true), 'stable');
}

function testClassifyDeltaRegressionLowerIsBetter(): void {
  assert.equal(classifyDelta(15, true), 'regression');
  assert.equal(classifyDelta(50, true), 'regression');
}

function testClassifyDeltaImprovementLowerIsBetter(): void {
  assert.equal(classifyDelta(-15, true), 'improvement');
  assert.equal(classifyDelta(-50, true), 'improvement');
}

function testClassifyDeltaHigherIsBetter(): void {
  assert.equal(classifyDelta(15, false), 'improvement');
  assert.equal(classifyDelta(-15, false), 'regression');
}

function testClassifyDeltaBoundary10(): void {
  assert.equal(classifyDelta(9, true), 'stable');
  assert.equal(classifyDelta(-9, true), 'stable');
  assert.equal(classifyDelta(10, true), 'regression');
  assert.equal(classifyDelta(-10, true), 'improvement');
  assert.equal(classifyDelta(11, true), 'regression');
  assert.equal(classifyDelta(-11, true), 'improvement');
}

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

function testFormatDurationSeconds(): void {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(5000), '5s');
}

function testFormatDurationMinutes(): void {
  assert.equal(formatDuration(120000), '2m 0s');
  assert.equal(formatDuration(125000), '2m 5s');
}

function testFormatDurationHours(): void {
  assert.equal(formatDuration(3600000), '1h 0m 0s');
  assert.equal(formatDuration(3661000), '1h 1m 1s');
}

function testFormatDurationNegative(): void {
  assert.equal(formatDuration(-100), '0s');
}

function testFormatDurationNaN(): void {
  assert.equal(formatDuration(NaN), '0s');
}

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

function testFormatBytesSmall(): void {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1023), '1023 B');
}

function testFormatBytesKB(): void {
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
}

function testFormatBytesMB(): void {
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(1024 * 1024 * 5.5), '5.5 MB');
}

function testFormatBytesNegative(): void {
  assert.equal(formatBytes(-1), '0 B');
}

// ---------------------------------------------------------------------------
// formatFee
// ---------------------------------------------------------------------------

function testFormatFee(): void {
  assert.equal(formatFee(100), '100 stroops');
  assert.equal(formatFee(1234.5), '1,235 stroops');
}

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

function testFormatNumberSmall(): void {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(42), '42');
}

function testFormatNumberThousands(): void {
  assert.equal(formatNumber(1000), '1.0K');
  assert.equal(formatNumber(15000), '15.0K');
}

function testFormatNumberMillions(): void {
  assert.equal(formatNumber(1_000_000), '1.0M');
  assert.equal(formatNumber(2_500_000), '2.5M');
}

// ---------------------------------------------------------------------------
// buildAggregateMetrics
// ---------------------------------------------------------------------------

function testBuildAggregateMetricsEmpty(): void {
  const m = buildAggregateMetrics([]);
  assert.equal(m.totalRuns, 0);
  assert.equal(m.avgDuration, 0);
  assert.equal(m.failureRate, 0);
  assert.equal(m.successRate, 0);
  assert.equal(m.criticalCount, 0);
  assert.equal(m.totalCrashes, 0);
  assert.equal(m.maxCpu, 0);
}

function testBuildAggregateMetricsSingleRun(): void {
  const runs = [
    makeRun({
      status: 'failed',
      severity: 'critical',
      duration: 2000,
      seedCount: 50,
      cpuInstructions: 100000,
      memoryBytes: 2048,
      minResourceFee: 200,
      crashDetail: { failureCategory: 'auth', signature: 'sig1', payload: 'p', replayAction: 'r' },
    }),
  ];
  const m = buildAggregateMetrics(runs);
  assert.equal(m.totalRuns, 1);
  assert.equal(m.statusCounts.failed, 1);
  assert.equal(m.statusCounts.completed, 0);
  assert.equal(m.severityCounts.critical, 1);
  assert.equal(m.avgDuration, 2000);
  assert.equal(m.avgSeeds, 50);
  assert.equal(m.avgCpu, 100000);
  assert.equal(m.avgMemory, 2048);
  assert.equal(m.avgFee, 200);
  assert.equal(m.maxCpu, 100000);
  assert.equal(m.maxMemory, 2048);
  assert.equal(m.maxFee, 200);
  assert.equal(m.failureRate, 100);
  assert.equal(m.successRate, 0);
  assert.equal(m.criticalCount, 1);
  assert.equal(m.totalCrashes, 1);
}

function testBuildAggregateMetricsMultipleRuns(): void {
  const runs = [
    makeRun({ status: 'completed', duration: 1000, cpuInstructions: 100, memoryBytes: 500, minResourceFee: 10 }),
    makeRun({ status: 'completed', duration: 3000, cpuInstructions: 300, memoryBytes: 1500, minResourceFee: 30 }),
    makeRun({ status: 'failed', severity: 'critical', duration: 2000, cpuInstructions: 200, memoryBytes: 1000, minResourceFee: 20,
      crashDetail: { failureCategory: 'x', signature: 'y', payload: 'z', replayAction: 'r' } }),
  ];
  const m = buildAggregateMetrics(runs);
  assert.equal(m.totalRuns, 3);
  assert.equal(m.statusCounts.completed, 2);
  assert.equal(m.statusCounts.failed, 1);
  assert.equal(m.severityCounts.critical, 1);
  assert.equal(m.avgDuration, 2000);
  assert.equal(m.avgSeeds, 100);
  assert.equal(m.avgCpu, 200);
  assert.equal(m.avgMemory, 1000);
  assert.equal(m.avgFee, 20);
  assert.equal(m.maxCpu, 300);
  assert.equal(m.maxMemory, 1500);
  assert.equal(m.maxFee, 30);
  assert.ok(Math.abs(m.failureRate - 100 / 3) < 0.01);
  assert.ok(Math.abs(m.successRate - 200 / 3) < 0.01);
  assert.equal(m.criticalCount, 1);
  assert.equal(m.totalCrashes, 1);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testCountByStatusEmpty();
testCountByStatusMixed();
testCountBySeverityEmpty();
testCountBySeverityMixed();
testAvgFieldEmpty();
testAvgFieldSingleRun();
testAvgFieldMultipleRuns();
testMaxFieldEmpty();
testMaxFieldSingleRun();
testMaxFieldMultipleRuns();
testSumFieldEmpty();
testSumFieldMultipleRuns();
testAvgDuration();
testAvgDurationEmpty();
testAvgSeeds();
testAvgCpuRounded();
testAvgMemoryRounded();
testAvgFeeRounded();
testMaxCpu();
testMaxMemory();
testMaxFee();
testMaxCpuEmpty();
testFailureRateEmpty();
testFailureRateAllFailed();
testFailureRateMixed();
testSuccessRateEmpty();
testSuccessRateAllCompleted();
testSuccessRateMixed();
testCriticalCountEmpty();
testCriticalCount();
testTotalCrashesEmpty();
testTotalCrashes();
testFilterByStatus();
testFilterByStatusEmpty();
testFilterByStatuses();
testFilterBySeverity();
testFilterNonCancelled();
testFilterWithCrash();
testDeltaPercentZeroBaseline();
testDeltaPercentPositive();
testDeltaPercentNegative();
testDeltaPercentEqual();
testDeltaPercentLargeValues();
testClassifyDeltaStableLowerIsBetter();
testClassifyDeltaRegressionLowerIsBetter();
testClassifyDeltaImprovementLowerIsBetter();
testClassifyDeltaHigherIsBetter();
testClassifyDeltaBoundary10();
testFormatDurationSeconds();
testFormatDurationMinutes();
testFormatDurationHours();
testFormatDurationNegative();
testFormatDurationNaN();
testFormatBytesSmall();
testFormatBytesKB();
testFormatBytesMB();
testFormatBytesNegative();
testFormatFee();
testFormatNumberSmall();
testFormatNumberThousands();
testFormatNumberMillions();
testBuildAggregateMetricsEmpty();
testBuildAggregateMetricsSingleRun();
testBuildAggregateMetricsMultipleRuns();

console.log('run-metrics.test.ts: all assertions passed');
