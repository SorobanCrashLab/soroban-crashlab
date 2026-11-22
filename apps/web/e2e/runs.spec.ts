import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

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
    expect(requestUrl.pathname).toBe('/api/runs');

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.describe('Runs list', () => {
  test('loads and renders the fuzzing runs list', async ({ page }) => {
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });

    const runsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.goto('/runs');
    await runsResponse;

    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();
    await expect(page.getByText(`${mockRuns.length} Total Runs`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Replay History' })).toBeVisible();

    const tableContainer = page.getByRole('region', { name: 'Virtualized fuzzing run table' });
    await expect(tableContainer.locator('th').filter({ hasText: /Run ID|Run Identifier/i })).toBeVisible();
    await expect(tableContainer.locator('th').filter({ hasText: /status/i })).toBeVisible();
    await expect(tableContainer.locator('th').filter({ hasText: /severity/i })).toBeVisible();

    const rows = tableContainer.locator('tbody tr');
    await expect(rows).toHaveCount(mockRuns.length);

    await expect(rows.nth(0)).toContainText('run-1003');
    await expect(rows.nth(0)).toContainText('Running');
    await expect(rows.nth(0)).toContainText('medium');

    await expect(rows.nth(1)).toContainText('run-1002');
    await expect(rows.nth(1)).toContainText('Failed');
    await expect(rows.nth(1)).toContainText('critical');
    await expect(rows.nth(1)).toContainText('18,200');

    await expect(rows.nth(2)).toContainText('run-1001');
    await expect(rows.nth(2)).toContainText('Completed');
    await expect(rows.nth(2)).toContainText('high');
  });

  test('shows an error state when the runs API fails and recovers after retry', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/runs', async (route) => {
      requestCount += 1;

      if (requestCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ runs: mockRuns, total: mockRuns.length }),
      });
    });

    await page.goto('/runs');

    await expect(page.getByText('Failed to load fuzzing runs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const retryResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.getByRole('button', { name: 'Retry' }).click();
    await retryResponse;

    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Virtualized fuzzing run table' }).locator('tbody tr'),
    ).toHaveCount(mockRuns.length);
  });
});
