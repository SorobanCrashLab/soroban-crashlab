import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };

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

test.describe('Mobile responsive layout', () => {
  test.use({ viewport: mobileViewport });

  test('shows hamburger navigation and drawer links on mobile', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();

    const desktopRunsLink = page.locator('header nav').getByRole('link', { name: /Runs/i });
    await expect(desktopRunsLink).toBeHidden();

    await page.getByRole('button', { name: 'Open navigation menu' }).click();

    const drawerRunsLink = page.locator('.drawer').getByRole('link', { name: 'Runs' });
    await expect(drawerRunsLink).toBeVisible();
    await expect(page.locator('.drawer').getByRole('link', { name: 'Dashboard' })).toBeVisible();

    await drawerRunsLink.click();

    await expect(page).toHaveURL(/\/runs$/);
    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();
  });

  test('keeps dashboard content within the mobile viewport width', async ({ page }) => {
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });

    const runsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.goto('/');
    await runsResponse;

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByRole('link', { name: 'View All Runs' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('closes the mobile drawer with the close button', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    await page.getByRole('button', { name: 'Close navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toHaveCount(0);
  });
});
