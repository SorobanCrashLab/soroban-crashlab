/**
 * Utilities for detecting and analyzing flaky tests
 */

export interface FlakyTestDetection {
  id: string;
  testName: string;
  signature: string;
  totalRuns: number;
  failureCount: number;
  lastFailure: string;
  trendData: boolean[];
}

export function calculateFlakinessScore(test: FlakyTestDetection): number {
  const failureRate = (test.failureCount / test.totalRuns) * 100;

  const recentTrend = test.trendData.slice(-5);
  const recentFlips = recentTrend.reduce((acc, curr, idx) => {
    if (idx === 0) return 0;
    return acc + (curr !== recentTrend[idx - 1] ? 1 : 0);
  }, 0);

  const instabilityBonus = recentFlips * 5;

  const score = Math.min(100, failureRate * 1.5 + instabilityBonus);
  return Math.round(score);
}

export function generateFlakyTestData(count: number): FlakyTestDetection[] {
  const testNames = [
    "test_token_transfer_concurrent",
    "test_vault_rebalance_stress",
    "test_router_swap_timeout",
    "test_auth_signature_validation",
    "test_state_consistency_check",
    "test_budget_exceeded_handling",
    "test_xdr_deserialization_edge_case",
    "test_network_retry_mechanism",
    "test_contract_invoke_async",
    "test_fee_calculation_precision",
    "test_asset_issuance_limits",
    "test_liquidity_pool_drain",
    "test_multisig_threshold",
    "test_account_merge_sequence",
    "test_claimable_balance_timing",
  ];

  return Array.from({ length: Math.min(count, testNames.length) }, (_, i) => {
    const totalRuns = 50 + Math.floor(Math.random() * 150);
    const failureCount = Math.floor(Math.random() * (totalRuns * 0.4));

    const trendData: boolean[] = [];
    for (let j = 0; j < 20; j++) {
      trendData.push(Math.random() > failureCount / totalRuns);
    }

    return {
      id: `test-${i + 1}`,
      testName: testNames[i],
      signature: `sig:${testNames[i]}:${i + 1000}`,
      totalRuns,
      failureCount,
      lastFailure: new Date(
        Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trendData,
    };
  });
}

export function groupTestsByFlakiness(tests: FlakyTestDetection[]): {
  high: FlakyTestDetection[];
  medium: FlakyTestDetection[];
  low: FlakyTestDetection[];
} {
  const high: FlakyTestDetection[] = [];
  const medium: FlakyTestDetection[] = [];
  const low: FlakyTestDetection[] = [];

  tests.forEach((test) => {
    const score = calculateFlakinessScore(test);
    if (score >= 70) high.push(test);
    else if (score >= 40) medium.push(test);
    else low.push(test);
  });

  return { high, medium, low };
}

export function analyzeTrendPattern(
  trendData: boolean[],
): "stable" | "intermittent" | "degrading" | "improving" {
  if (trendData.length < 5) return "stable";

  const recent = trendData.slice(-10);
  const older = trendData.slice(0, -10);

  const recentFailRate = recent.filter((p) => !p).length / recent.length;
  const olderFailRate =
    older.length > 0
      ? older.filter((p) => !p).length / older.length
      : recentFailRate;

  const flips = recent.reduce((acc, curr, idx) => {
    if (idx === 0) return 0;
    return acc + (curr !== recent[idx - 1] ? 1 : 0);
  }, 0);

  if (flips > recent.length * 0.5) return "intermittent";
  if (recentFailRate > olderFailRate * 1.5) return "degrading";
  if (recentFailRate < olderFailRate * 0.5) return "improving";
  return "stable";
}
