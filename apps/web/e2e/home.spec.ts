import { test, expect } from './fixtures';

/**
 * Home page e2e tests
 * These tests verify the basic functionality of the home page
 */

test.describe('Home Page', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    // Navigate to the home page before each test
    await page.goto('/');
  });

  test('should load the home page successfully', async ({ page }) => {
    // Verify page title or heading is present
    await expect(page).toHaveTitle(/Home|Soroban/i);
  });

  test('should render the main content area', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 30000 });
  });

  test('should have accessible heading structure', async ({ page }) => {
    // Prefer an h1 when present; fall back to any landmark heading.
    const h1 = page.locator('h1');
    if (await h1.count()) {
      await expect(h1.first()).toBeVisible({ timeout: 15000 });
      return;
    }
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15000 });
  });

  test('should have no console errors', async ({ page }) => {
    const errors: string[] = [];
    const ignoredPatterns = [
      /Content Security Policy/i,
      /fonts\.googleapis\.com/i,
      /status of 429/i,
      /Too Many Requests/i,
      /Connection closed/i,
    ];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Reload to capture any errors during page load
    await page.reload();
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });

    const criticalErrors = errors.filter(
      (error) => !ignoredPatterns.some((pattern) => pattern.test(error)),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('should respond to basic user interactions', async ({ page }) => {
    // This is a placeholder test for basic interaction verification
    // Add specific interactions based on your home page UI
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
