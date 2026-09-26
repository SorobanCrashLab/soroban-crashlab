import { computeWidgetMetrics } from "./implement-cross-run-board-widgets-component";
import { FuzzingRun, RunStatus, RunArea, RunSeverity } from "./types";

// Test utilities
function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: `run-${Math.random().toString(36).substr(2, 9)}`,
    status: "completed" as RunStatus,
    area: "auth" as RunArea,
    severity: "low" as RunSeverity,
    duration: 300000, // 5 minutes
    seedCount: 50000,
    cpuInstructions: 500000,
    memoryBytes: 2000000,
    minResourceFee: 1000,
    crashDetail: null,
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test: computeWidgetMetrics with empty runs
function testComputeWidgetMetricsEmpty(): void {
  const metrics = computeWidgetMetrics([]);
  
  assert(metrics.totalRuns === 0, "Empty runs should have 0 total runs");
  assert(metrics.completedRuns === 0, "Empty runs should have 0 completed runs");
  assert(metrics.failedRuns === 0, "Empty runs should have 0 failed runs");
  assert(metrics.runningRuns === 0, "Empty runs should have 0 running runs");
  assert(metrics.cancelledRuns === 0, "Empty runs should have 0 cancelled runs");
  assert(metrics.avgDuration === 0, "Empty runs should have 0 average duration");
  assert(metrics.avgSeeds === 0, "Empty runs should have 0 average seeds");
  assert(metrics.criticalIssues === 0, "Empty runs should have 0 critical issues");
  assert(metrics.successRate === 0, "Empty runs should have 0% success rate");
  
  console.log("✓ testComputeWidgetMetricsEmpty passed");
}

// Test: computeWidgetMetrics with single run
function testComputeWidgetMetricsSingle(): void {
  const run = makeRun({
    status: "completed",
    duration: 600000, // 10 minutes
    seedCount: 75000,
    severity: "medium",
  });
  
  const metrics = computeWidgetMetrics([run]);
  
  assert(metrics.totalRuns === 1, "Single run should have 1 total run");
  assert(metrics.completedRuns === 1, "Single completed run should have 1 completed");
  assert(metrics.failedRuns === 0, "Single completed run should have 0 failed");
  assert(metrics.runningRuns === 0, "Single completed run should have 0 running");
  assert(metrics.cancelledRuns === 0, "Single completed run should have 0 cancelled");
  assert(metrics.avgDuration === 600000, "Single run should have correct average duration");
  assert(metrics.avgSeeds === 75000, "Single run should have correct average seeds");
  assert(metrics.criticalIssues === 0, "Single medium severity run should have 0 critical issues");
  assert(metrics.successRate === 100, "Single completed run should have 100% success rate");
  
  console.log("✓ testComputeWidgetMetricsSingle passed");
}

// Test: computeWidgetMetrics with mixed statuses
function testComputeWidgetMetricsMixed(): void {
  const runs = [
    makeRun({ status: "completed", duration: 300000, seedCount: 50000, severity: "low" }),
    makeRun({ status: "completed", duration: 600000, seedCount: 75000, severity: "medium" }),
    makeRun({ status: "failed", duration: 150000, seedCount: 25000, severity: "critical" }),
    makeRun({ status: "running", duration: 450000, seedCount: 60000, severity: "high" }),
    makeRun({ status: "cancelled", duration: 100000, seedCount: 10000, severity: "low" }),
  ];
  
  const metrics = computeWidgetMetrics(runs);
  
  assert(metrics.totalRuns === 5, "Mixed runs should have correct total count");
  assert(metrics.completedRuns === 2, "Mixed runs should have 2 completed");
  assert(metrics.failedRuns === 1, "Mixed runs should have 1 failed");
  assert(metrics.runningRuns === 1, "Mixed runs should have 1 running");
  assert(metrics.cancelledRuns === 1, "Mixed runs should have 1 cancelled");
  
  // Average duration: (300000 + 600000 + 150000 + 450000 + 100000) / 5 = 320000
  assert(metrics.avgDuration === 320000, "Mixed runs should have correct average duration");
  
  // Average seeds: (50000 + 75000 + 25000 + 60000 + 10000) / 5 = 44000
  assert(metrics.avgSeeds === 44000, "Mixed runs should have correct average seeds");
  
  assert(metrics.criticalIssues === 1, "Mixed runs should have 1 critical issue");
  
  // Success rate: 2 completed / 5 total = 40%
  assert(metrics.successRate === 40, "Mixed runs should have 40% success rate");
  
  console.log("✓ testComputeWidgetMetricsMixed passed");
}

// Test: computeWidgetMetrics with all failed runs
function testComputeWidgetMetricsAllFailed(): void {
  const runs = [
    makeRun({ status: "failed", severity: "critical" }),
    makeRun({ status: "failed", severity: "high" }),
    makeRun({ status: "failed", severity: "critical" }),
  ];
  
  const metrics = computeWidgetMetrics(runs);
  
  assert(metrics.totalRuns === 3, "All failed runs should have correct total count");
  assert(metrics.completedRuns === 0, "All failed runs should have 0 completed");
  assert(metrics.failedRuns === 3, "All failed runs should have 3 failed");
  assert(metrics.runningRuns === 0, "All failed runs should have 0 running");
  assert(metrics.cancelledRuns === 0, "All failed runs should have 0 cancelled");
  assert(metrics.criticalIssues === 2, "All failed runs should have 2 critical issues");
  assert(metrics.successRate === 0, "All failed runs should have 0% success rate");
  
  console.log("✓ testComputeWidgetMetricsAllFailed passed");
}

// Test: computeWidgetMetrics with large dataset
function testComputeWidgetMetricsLarge(): void {
  const runs: FuzzingRun[] = [];
  
  // Generate 100 runs with predictable distribution
  for (let i = 0; i < 100; i++) {
    const status: RunStatus = i < 70 ? "completed" : i < 85 ? "failed" : i < 95 ? "running" : "cancelled";
    const severity: RunSeverity = i < 10 ? "critical" : i < 30 ? "high" : i < 60 ? "medium" : "low";
    
    runs.push(makeRun({
      status,
      severity,
      duration: 300000 + (i * 1000), // Varying durations
      seedCount: 50000 + (i * 100), // Varying seed counts
    }));
  }
  
  const metrics = computeWidgetMetrics(runs);
  
  assert(metrics.totalRuns === 100, "Large dataset should have correct total count");
  assert(metrics.completedRuns === 70, "Large dataset should have 70 completed");
  assert(metrics.failedRuns === 15, "Large dataset should have 15 failed");
  assert(metrics.runningRuns === 10, "Large dataset should have 10 running");
  assert(metrics.cancelledRuns === 5, "Large dataset should have 5 cancelled");
  assert(metrics.criticalIssues === 10, "Large dataset should have 10 critical issues");
  assert(metrics.successRate === 70, "Large dataset should have 70% success rate");
  
  // Verify averages are reasonable
  assert(metrics.avgDuration > 300000, "Large dataset should have reasonable average duration");
  assert(metrics.avgSeeds > 50000, "Large dataset should have reasonable average seeds");
  
  console.log("✓ testComputeWidgetMetricsLarge passed");
}

// Test: Edge case with zero duration and seeds
function testComputeWidgetMetricsZeroValues(): void {
  const runs = [
    makeRun({ duration: 0, seedCount: 0 }),
    makeRun({ duration: 100000, seedCount: 1000 }),
  ];
  
  const metrics = computeWidgetMetrics(runs);
  
  assert(metrics.avgDuration === 50000, "Zero values should be handled correctly in averages");
  assert(metrics.avgSeeds === 500, "Zero values should be handled correctly in averages");
  
  console.log("✓ testComputeWidgetMetricsZeroValues passed");
}

// Test: Boundary conditions for success rate calculation
function testComputeWidgetMetricsSuccessRateBoundaries(): void {
  // Test 100% success rate
  const allCompleted = [
    makeRun({ status: "completed" }),
    makeRun({ status: "completed" }),
  ];
  
  const allCompletedMetrics = computeWidgetMetrics(allCompleted);
  assert(allCompletedMetrics.successRate === 100, "All completed runs should have 100% success rate");
  
  // Test 0% success rate
  const nonCompleted = [
    makeRun({ status: "failed" }),
    makeRun({ status: "running" }),
    makeRun({ status: "cancelled" }),
  ];
  
  const nonCompletedMetrics = computeWidgetMetrics(nonCompleted);
  assert(nonCompletedMetrics.successRate === 0, "No completed runs should have 0% success rate");
  
  // Test 50% success rate
  const halfCompleted = [
    makeRun({ status: "completed" }),
    makeRun({ status: "failed" }),
  ];
  
  const halfCompletedMetrics = computeWidgetMetrics(halfCompleted);
  assert(halfCompletedMetrics.successRate === 50, "Half completed runs should have 50% success rate");
  
  console.log("✓ testComputeWidgetMetricsSuccessRateBoundaries passed");
}

// Run all tests
function runAllTests(): void {
  console.log("Running Cross-run Board Widgets Component Tests...\n");
  
  try {
    testComputeWidgetMetricsEmpty();
    testComputeWidgetMetricsSingle();
    testComputeWidgetMetricsMixed();
    testComputeWidgetMetricsAllFailed();
    testComputeWidgetMetricsLarge();
    testComputeWidgetMetricsZeroValues();
    testComputeWidgetMetricsSuccessRateBoundaries();
    
    console.log("\n✅ All Cross-run Board Widgets Component tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Export for external test runners
export {
  computeWidgetMetrics,
  makeRun,
  runAllTests,
};

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}