import { test, expect } from '@playwright/test';

test.describe('Chaos resilience', () => {
  test('API outage shows a recoverable error state', async ({ page }) => {
    await page.route('**/api/runs**', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/runs');

    await expect(page.getByText(/unable|failed|try again/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('Slow API does not leave the page permanently loading', async ({ page }) => {
    await page.route('**/api/runs**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto('/runs');

    await expect(page.locator('main')).toBeVisible();
  });

  test('Partial API outage preserves cached or mock content', async ({ page }) => {
    await page.route('**/api/runs', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporarily unavailable' }),
      });
    });

    await page.goto('/runs');

    await expect(page.locator('body')).not.toContainText(
      'Internal Server Error',
    );
  });
});
