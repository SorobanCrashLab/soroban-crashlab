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

const fulfillRunsRequest = async (page: Page) => {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: mockRuns, total: mockRuns.length }),
    });
  });
};

test.describe('Keyboard sorting and aria-sort semantics', () => {
  test('allows keyboard users to sort table columns and exposes aria-sort states', async ({ page }) => {
    await fulfillRunsRequest(page);
    await page.goto('/runs');

    const tableRegion = page.getByRole('region', { name: 'Virtualized fuzzing run table' });
    await expect(tableRegion).toBeVisible();

    // Verify Run ID header column and inner button
    const runIdTh = tableRegion.locator('th').filter({ hasText: /Run ID/i });
    await expect(runIdTh).toBeVisible();
    await expect(runIdTh).toHaveAttribute('scope', 'col');

    const runIdButton = runIdTh.getByRole('button', { name: /Run ID/i });
    await expect(runIdButton).toBeVisible();

    // Initial default state is queuedAt desc, so Run ID has aria-sort="none"
    await expect(runIdTh).toHaveAttribute('aria-sort', 'none');

    // Focus Run ID button using keyboard navigation
    await runIdButton.focus();
    await expect(runIdButton).toBeFocused();

    // 1st Enter: asc → asc sort, aria-sort="ascending"
    await page.keyboard.press('Enter');
    await expect(runIdTh).toHaveAttribute('aria-sort', 'ascending');

    const rowsAfterAsc = tableRegion.locator('tbody tr');
    await expect(rowsAfterAsc.nth(0)).toContainText('run-1001');
    await expect(rowsAfterAsc.nth(1)).toContainText('run-1002');
    await expect(rowsAfterAsc.nth(2)).toContainText('run-1003');

    // 2nd Enter: desc → desc sort, aria-sort="descending"
    await page.keyboard.press('Enter');
    await expect(runIdTh).toHaveAttribute('aria-sort', 'descending');

    const rowsAfterDesc = tableRegion.locator('tbody tr');
    await expect(rowsAfterDesc.nth(0)).toContainText('run-1003');
    await expect(rowsAfterDesc.nth(1)).toContainText('run-1002');
    await expect(rowsAfterDesc.nth(2)).toContainText('run-1001');

    // 3rd Enter: none → returns to default, aria-sort="none"
    await page.keyboard.press('Enter');
    await expect(runIdTh).toHaveAttribute('aria-sort', 'none');

    // 4th: Switch to Duration column via keyboard
    const durationTh = tableRegion.locator('th').filter({ hasText: /Duration/i });
    const durationButton = durationTh.getByRole('button', { name: /Duration/i });
    await durationButton.focus();
    await expect(durationButton).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(durationTh).toHaveAttribute('aria-sort', 'ascending');
    await expect(runIdTh).toHaveAttribute('aria-sort', 'none');

    const rowsAfterDuration = tableRegion.locator('tbody tr');
    await expect(rowsAfterDuration.nth(0)).toContainText('run-1003'); // 90000ms
    await expect(rowsAfterDuration.nth(1)).toContainText('run-1001'); // 180000ms
    await expect(rowsAfterDuration.nth(2)).toContainText('run-1002'); // 240000ms
  });
});
