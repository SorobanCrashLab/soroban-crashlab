import * as assert from 'node:assert/strict';
import {
  buildAreaClusters,
  buildClustersForMode,
  buildFailureSignatureClusters,
  buildMockClusters,
  buildPerformanceClusters,
  buildSeverityClusters,
  buildStatusClusters,
  computeClusterMetrics,
  formatBytes,
  formatDuration,
  sortClustersBy,
} from "./run-cluster-visualization-utils";
import { FuzzingRun } from "./types";

// Helper to build a minimal FuzzingRun
function makeRun(overrides: Partial<FuzzingRun>): FuzzingRun {
  return {
    id: "test-id",
    status: "completed",
    area: "auth",
    severity: "low",
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1024,
    minResourceFee: 0,
    ...overrides,
  };
}

function testComputeClusterMetrics() {
  console.log('Running testComputeClusterMetrics...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'r1', status: 'completed', duration: 1000, cpuInstructions: 100, memoryBytes: 1024 }),
    makeRun({ id: 'r2', status: 'failed', duration: 3000, cpuInstructions: 300, memoryBytes: 3072 }),
  ];

  const metrics = computeClusterMetrics(runs);

  assert.strictEqual(metrics.totalRuns, 2);
  assert.strictEqual(metrics.avgDuration, 2000, 'avg duration should average the two runs');
  assert.strictEqual(metrics.avgCpuInstructions, 200);
  assert.strictEqual(metrics.avgMemoryBytes, 2048);
  assert.strictEqual(metrics.failureRate, 50, 'half the runs failed');
  assert.strictEqual(metrics.throughput, 2, '1h+ max duration floors throughput at totalRuns');

  console.log('testComputeClusterMetrics passed!');
}

function testSortClustersBy() {
  console.log('Running testSortClustersBy...');
  const clusterA = { id: 'a', label: 'A', runs: [makeRun({})], color: 'blue', icon: 'a', avgDuration: 1000, failureRate: 0 };
  const clusterB = { id: 'b', label: 'B', runs: [makeRun({}), makeRun({})], color: 'red', icon: 'b', avgDuration: 5000, failureRate: 30 };
  const clusterC = { id: 'c', label: 'C', runs: [makeRun({}), makeRun({}), makeRun({})], color: 'green', icon: 'c', avgDuration: 2000, failureRate: 10 };

  const byCount = sortClustersBy([clusterA, clusterB, clusterC], 'count');
  assert.deepStrictEqual(byCount.map((c) => c.id), ['c', 'b', 'a'], 'count sorts descending by run count');

  const byDuration = sortClustersBy([clusterA, clusterB, clusterC], 'duration');
  assert.deepStrictEqual(byDuration.map((c) => c.id), ['b', 'c', 'a'], 'duration sorts descending by avg duration');

  const byFailure = sortClustersBy([clusterA, clusterB, clusterC], 'failure-rate');
  assert.deepStrictEqual(byFailure.map((c) => c.id), ['b', 'c', 'a'], 'failure-rate sorts descending');

  console.log('testSortClustersBy passed!');
}

function testBuildClustersForModeDispatch() {
  console.log('Running testBuildClustersForModeDispatch...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'r1', status: 'failed', area: 'auth', severity: 'high', duration: 1000, crashDetail: { failureCategory: 'AuthError', signature: 'sig1', payload: '{}', replayAction: '' } }),
    makeRun({ id: 'r2', status: 'completed', area: 'state', severity: 'low', duration: 5000 }),
    makeRun({ id: 'r3', status: 'failed', area: 'auth', severity: 'high', duration: 3000, crashDetail: { failureCategory: 'AuthError', signature: 'sig1', payload: '{}', replayAction: '' } }),
  ];

  // Dispatch must be identical to calling the individual builders.
  assert.deepStrictEqual(buildClustersForMode(runs, 'status'), buildStatusClusters(runs));
  assert.deepStrictEqual(buildClustersForMode(runs, 'area'), buildAreaClusters(runs));
  assert.deepStrictEqual(buildClustersForMode(runs, 'severity'), buildSeverityClusters(runs));
  assert.deepStrictEqual(buildClustersForMode(runs, 'performance'), buildPerformanceClusters(runs));
  assert.deepStrictEqual(buildClustersForMode(runs, 'failure'), buildFailureSignatureClusters(runs));

  console.log('testBuildClustersForModeDispatch passed!');
}

function testBuildPerformanceClustersEmpty() {
  console.log('Running testBuildPerformanceClustersEmpty...');
  assert.deepStrictEqual(buildPerformanceClusters([]), [], 'empty input yields no clusters');
  console.log('testBuildPerformanceClustersEmpty passed!');
}

function testFormatDuration() {
  console.log('Running testFormatDuration...');
  assert.strictEqual(formatDuration(0), '0m 0s');
  assert.strictEqual(formatDuration(65000), '1m 5s');
  assert.strictEqual(formatDuration(200000), '3m 20s');
  console.log('testFormatDuration passed!');
}

function testFormatBytes() {
  console.log('Running testFormatBytes...');
  assert.strictEqual(formatBytes(512), '512 B');
  assert.strictEqual(formatBytes(2048), '2.0 KB');
  assert.strictEqual(formatBytes(5 * 1024 * 1024), '5.0 MB');
  console.log('testFormatBytes passed!');
}

function testBuildMockClustersDeterministic() {
  console.log('Running testBuildMockClustersDeterministic...');
  const runs = buildMockClusters(42);
  const again = buildMockClusters(42);

  assert.strictEqual(runs.length, 25, 'Mock clusters should have 25 runs');
  assert.strictEqual(runs[0].id, 'run-1000');
  assert.deepStrictEqual(runs, again, 'same seed must produce identical data');
  console.log('testBuildMockClustersDeterministic passed!');
}

try {
  testComputeClusterMetrics();
  testSortClustersBy();
  testBuildClustersForModeDispatch();
  testBuildPerformanceClustersEmpty();
  testFormatDuration();
  testFormatBytes();
  testBuildMockClustersDeterministic();
  console.log('\nAll run-cluster-visualization-utils tests passed!');
} catch (error) {
  console.error('Tests failed!');
  console.error(error);
  process.exit(1);
}