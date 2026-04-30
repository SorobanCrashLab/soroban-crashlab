import * as assert from 'node:assert/strict';
import {
  buildStatusClusters,
  buildAreaClusters,
  buildSeverityClusters,
  buildPerformanceClusters,
  buildMockClusters,
  buildFailureSignatureClusters,
} from "./add-run-cluster-visualization";
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

function testBuildStatusClusters() {
  console.log('Running testBuildStatusClusters...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', status: 'completed' }),
    makeRun({ id: 'run-2', status: 'failed' }),
    makeRun({ id: 'run-3', status: 'failed' }),
    makeRun({ id: 'run-4', status: 'running' }),
  ];

  const clusters = buildStatusClusters(runs);
  
  // Should have 3 clusters (completed, failed, running)
  assert.strictEqual(clusters.length, 3, 'Should have 3 status clusters');
  
  const failedCluster = clusters.find(c => c.id === 'status-failed');
  assert.ok(failedCluster, 'Failed cluster should exist');
  assert.strictEqual(failedCluster?.runs.length, 2, 'Failed cluster should have 2 runs');
  assert.strictEqual(failedCluster?.failureRate, 100, 'Failed cluster failure rate should be 100%');

  const completedCluster = clusters.find(c => c.id === 'status-completed');
  assert.strictEqual(completedCluster?.runs.length, 1, 'Completed cluster should have 1 run');
  assert.strictEqual(completedCluster?.failureRate, 0, 'Completed cluster failure rate should be 0%');

  console.log('testBuildStatusClusters passed!');
}

function testBuildAreaClusters() {
  console.log('Running testBuildAreaClusters...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', area: 'auth' }),
    makeRun({ id: 'run-2', area: 'state' }),
    makeRun({ id: 'run-3', area: 'auth' }),
    makeRun({ id: 'run-4', area: 'budget' }),
  ];

  const clusters = buildAreaClusters(runs);
  
  assert.strictEqual(clusters.length, 3, 'Should have 3 area clusters');
  
  const authCluster = clusters.find(c => c.id === 'area-auth');
  assert.strictEqual(authCluster?.runs.length, 2, 'Auth cluster should have 2 runs');

  const stateCluster = clusters.find(c => c.id === 'area-state');
  assert.strictEqual(stateCluster?.runs.length, 1, 'State cluster should have 1 run');

  console.log('testBuildAreaClusters passed!');
}

function testBuildSeverityClusters() {
  console.log('Running testBuildSeverityClusters...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', severity: 'low' }),
    makeRun({ id: 'run-2', severity: 'critical' }),
    makeRun({ id: 'run-3', severity: 'critical' }),
  ];

  const clusters = buildSeverityClusters(runs);
  
  assert.strictEqual(clusters.length, 2, 'Should have 2 severity clusters');
  
  const criticalCluster = clusters.find(c => c.id === 'severity-critical');
  assert.strictEqual(criticalCluster?.runs.length, 2, 'Critical cluster should have 2 runs');

  console.log('testBuildSeverityClusters passed!');
}

function testBuildPerformanceClusters() {
  console.log('Running testBuildPerformanceClusters...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-fast', duration: 1000 }), // Fast
    makeRun({ id: 'run-slow', duration: 10000 }), // Slow
    makeRun({ id: 'run-normal', duration: 5000 }), // Normal
  ];
  // avg = (1000 + 10000 + 5000) / 3 = 5333
  // fast threshold = 5333 * 0.7 = 3733
  // slow threshold = 5333 * 1.5 = 8000

  const clusters = buildPerformanceClusters(runs);
  
  const fastCluster = clusters.find(c => c.id === 'perf-fast');
  assert.strictEqual(fastCluster?.runs.length, 1, 'Should have 1 fast run');
  assert.strictEqual(fastCluster?.runs[0].id, 'run-fast');

  const slowCluster = clusters.find(c => c.id === 'perf-slow');
  assert.strictEqual(slowCluster?.runs.length, 1, 'Should have 1 slow run');
  assert.strictEqual(slowCluster?.runs[0].id, 'run-slow');

  console.log('testBuildPerformanceClusters passed!');
}

function testBuildMockClusters() {
  console.log('Running testBuildMockClusters...');
  const runs = buildMockClusters(42);
  assert.strictEqual(runs.length, 25, 'Mock clusters should have 25 runs');
  assert.ok(runs[0].id.startsWith('run-'), 'IDs should start with run-');
  console.log('testBuildMockClusters passed!');
}

function testBuildFailureSignatureClusters() {
  console.log('Running testBuildFailureSignatureClusters...');
  const runs: FuzzingRun[] = [
    makeRun({ id: 'run-1', status: 'failed', area: 'auth', crashDetail: { failureCategory: 'AuthError', signature: 'sig1', payload: '', replayAction: '' } }),
    makeRun({ id: 'run-2', status: 'failed', area: 'auth', crashDetail: { failureCategory: 'AuthError', signature: 'sig1', payload: '', replayAction: '' } }),
    makeRun({ id: 'run-3', status: 'failed', area: 'state', crashDetail: { failureCategory: 'StateError', signature: 'sig2', payload: '', replayAction: '' } }),
    makeRun({ id: 'run-4', status: 'completed' }),
  ];

  const clusters = buildFailureSignatureClusters(runs);
  
  assert.strictEqual(clusters.length, 2, 'Should have 2 failure signature clusters');
  
  const authCluster = clusters.find(c => c.label === 'AuthError');
  assert.strictEqual(authCluster?.runs.length, 2, 'AuthError cluster should have 2 runs');

  console.log('testBuildFailureSignatureClusters passed!');
}

try {
  testBuildStatusClusters();
  testBuildAreaClusters();
  testBuildSeverityClusters();
  testBuildPerformanceClusters();
  testBuildMockClusters();
  testBuildFailureSignatureClusters();
  console.log('\nAll add-run-cluster-visualization tests passed!');
} catch (error) {
  console.error('Tests failed!');
  console.error(error);
  process.exit(1);
}
