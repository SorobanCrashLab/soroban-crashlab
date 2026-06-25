import { test, expect, type Page } from '@playwright/test';

const mockRuns = [
  {
    id: 'run-1001',
    status: 'completed',
    area: 'state',
    severity: 'high',
    duration: 180000,
    seedCount: 12500,
    crashDetail: null,
    cpuInstructions: 12300000,
    memoryBytes: 524288000,
    minResourceFee: 17500,
    queuedAt: '2026-05-31T09:00:00.000Z',
    startedAt: '2026-05-31T09:01:00.000Z',
    finishedAt: '2026-05-31T09:04:00.000Z',
  },
  {
    id: 'run-1002',
    status: 'failed',
    area: 'auth',
    severity: 'critical',
    duration: 240000,
    seedCount: 18200,
    crashDetail: {
      failureCategory: 'authorization',
      signature: 'auth-overflow',
      payload: 'AAAA',
      replayAction: 'soroban test --replay run-1002',
    },
    cpuInstructions: 15200000,
    memoryBytes: 629145600,
    minResourceFee: 22000,
    queuedAt: '2026-05-31T09:05:00.000Z',
    startedAt: '2026-05-31T09:06:00.000Z',
    finishedAt: '2026-05-31T09:10:00.000Z',
  },
  {
    id: 'run-1003',
    status: 'running',
    area: 'budget',
    severity: 'medium',
    duration: 90000,
    seedCount: 9800,
    crashDetail: null,
    cpuInstructions: 8100000,
    memoryBytes: 419430400,
    minResourceFee: 14250,
    queuedAt: '2026-05-31T09:15:00.000Z',
    startedAt: '2026-05-31T09:16:00.000Z',
  },
];

const fulfillRunsRequest = async (page: Page, body: unknown, status = 200) => {
  await page.route('**/api/runs', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname !== '/api/runs') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.describe('Dashboard page load', () => {
  test('loads dashboard and renders recent runs after API success', async ({ page }) => {
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });

    const runsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.goto('/');
    await runsResponse;

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Fuzzing campaign overview')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View All Runs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Runs' })).toBeVisible();

    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'ID' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Area' })).toBeVisible();

    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(Math.min(mockRuns.length, 8));
    await expect(rows.nth(0)).toContainText('run-1001');
    await expect(rows.nth(1)).toContainText('run-1002');
    await expect(rows.nth(2)).toContainText('run-1003');
  });

  test('shows connection error when the runs API fails', async ({ page }) => {
    await fulfillRunsRequest(page, { error: 'Internal server error' }, 500);

    await page.goto('/');

    await expect(page.getByText('Connection Error')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Runs' })).not.toBeVisible();
  });
});
