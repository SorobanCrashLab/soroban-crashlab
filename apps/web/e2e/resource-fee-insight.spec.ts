import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const THRESHOLDS = {
  cpuWarning: 900_000,
  cpuCritical: 5_000_000,
  memoryWarning: 7_000_000,
  memoryCritical: 10_000_000,
  feeWarning: 2_500,
  feeCritical: 5_000,
};

function histogram(metric: 'cpu' | 'memory' | 'fee', warning: number, critical: number) {
  return {
    metric,
    buckets: [
      { index: 0, start: 0, end: 25, count: 1 },
      { index: 1, start: 25, end: 50, count: 1 },
      { index: 2, start: 50, end: 75, count: 1 },
      { index: 3, start: 75, end: 100, count: 0 },
    ],
    min: 0,
    max: 100,
    total: 3,
    warning,
    critical,
    warningMarker: { level: 'warning', value: warning, position: 50, inRange: true },
    criticalMarker: { level: 'critical', value: critical, position: 90, inRange: true },
  };
}

function crossing(metric: 'cpu' | 'memory' | 'fee', warning: number, critical: number) {
  return {
    metric,
    warningThreshold: warning,
    criticalThreshold: critical,
    warningCount: 1,
    criticalCount: 1,
    crossingCount: 2,
    total: 3,
    crossingRatio: 2 / 3,
  };
}

function feeInsight(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-fixture',
    runCount: 4,
    runsWithFeeData: 3,
    runsWithoutFeeData: 1,
    coverage: { envelope: 2, legacy: 1, absent: 1 },
    hasFeeData: true,
    thresholds: THRESHOLDS,
    histograms: {
      cpu: histogram('cpu', THRESHOLDS.cpuWarning, THRESHOLDS.cpuCritical),
      memory: histogram('memory', THRESHOLDS.memoryWarning, THRESHOLDS.memoryCritical),
      fee: histogram('fee', THRESHOLDS.feeWarning, THRESHOLDS.feeCritical),
    },
    thresholdCrossings: {
      cpu: crossing('cpu', THRESHOLDS.cpuWarning, THRESHOLDS.cpuCritical),
      memory: crossing('memory', THRESHOLDS.memoryWarning, THRESHOLDS.memoryCritical),
      fee: crossing('fee', THRESHOLDS.feeWarning, THRESHOLDS.feeCritical),
      total: 6,
    },
    expensiveFixtures: [
      {
        fixture: 'token::transfer',
        contract: 'token',
        method: 'transfer',
        runCount: 2,
        totalFee: 7_000,
        avgFee: 3_500,
        maxFee: 4_500,
        maxCpu: 900_000,
        maxMemory: 2_400_000,
        expensiveCount: 1,
        representativeRunId: 'run-1001',
        href: '/runs/run-1001',
        statuses: { completed: 1, failed: 1 },
      },
    ],
    trend: [
      {
        ts: 1_772_352_000_000,
        bucketStart: '2026-03-01T08:00:00.000Z',
        runCount: 2,
        totalFee: 5_000,
        avgFee: 2_500,
        maxFee: 3_000,
        avgCpu: 500_000,
        avgMemory: 2_000_000,
        warningCount: 1,
        criticalCount: 0,
      },
      {
        ts: 1_772_355_600_000,
        bucketStart: '2026-03-01T09:00:00.000Z',
        runCount: 1,
        totalFee: 4_500,
        avgFee: 4_500,
        maxFee: 4_500,
        avgCpu: 900_000,
        avgMemory: 2_400_000,
        warningCount: 0,
        criticalCount: 0,
      },
    ],
    trendDownsampled: false,
    trendBucketMs: 3_600_000,
    totals: {
      totalCpu: 1_400_000,
      avgCpu: 466_666,
      maxCpu: 900_000,
      totalMemory: 4_400_000,
      avgMemory: 1_466_666,
      maxMemory: 2_400_000,
      totalFee: 9_500,
      avgFee: 3_166,
      maxFee: 4_500,
    },
    expensiveSuccessCount: 1,
    expensiveFailureCount: 1,
    ...overrides,
  };
}

async function fulfillFees(page: Page, data: Record<string, unknown>) {
  await page.route(/\/api\/campaigns\/campaign-fixture\/fees/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
}

test.describe('Resource fee insight panel', () => {
  test('renders histograms, thresholds and drills into a run', async ({ page }) => {
    await fulfillFees(page, feeInsight());

    await page.goto('/campaigns/campaign-fixture');

    await expect(page.getByRole('heading', { name: 'Campaign campaign-fixture' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resource Fee Insight' })).toBeVisible();
    await expect(page.getByText('CPU instructions')).toBeVisible();
    await expect(page.getByText('Top expensive fixtures')).toBeVisible();
    await expect(page.getByText('token::transfer')).toBeVisible();
    await expect(page.getByText(/Warn ≥/).first()).toBeVisible();
    await expect(page.getByText(/Flag ≥/).first()).toBeVisible();

    await page.getByRole('link', { name: 'View run-1001' }).click();
    await expect(page).toHaveURL(/\/runs\/run-1001$/);
    await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
  });

  test('shows empty-campaign guidance', async ({ page }) => {
    await fulfillFees(
      page,
      feeInsight({
        runCount: 0,
        runsWithFeeData: 0,
        runsWithoutFeeData: 0,
        coverage: { envelope: 0, legacy: 0, absent: 0 },
        hasFeeData: false,
        expensiveFixtures: [],
        trend: [],
        expensiveSuccessCount: 0,
        expensiveFailureCount: 0,
      }),
    );

    await page.goto('/campaigns/campaign-fixture');
    await expect(page.getByText('No runs in this campaign yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start a campaign' })).toBeVisible();
  });

  test('explains fee-data-absent runs recorded before W5-A12', async ({ page }) => {
    await fulfillFees(
      page,
      feeInsight({
        runCount: 2,
        runsWithFeeData: 0,
        runsWithoutFeeData: 2,
        coverage: { envelope: 0, legacy: 0, absent: 2 },
        hasFeeData: false,
        expensiveFixtures: [],
        trend: [],
        expensiveSuccessCount: 0,
        expensiveFailureCount: 0,
      }),
    );

    await page.goto('/campaigns/campaign-fixture');
    await expect(page.getByText('No fee tracking data for this campaign')).toBeVisible();
    await expect(page.getByText(/W5-A12/).first()).toBeVisible();
  });
});
