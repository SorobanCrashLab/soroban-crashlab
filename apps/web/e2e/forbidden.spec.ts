import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const FORBIDDEN_URL = /\/403\?capability=settings%3Awrite&from=%2Fmaintainer/;

async function gotoMaintainer(page: Page) {
  await page.goto('/maintainer', { waitUntil: 'domcontentloaded' });
}

test.describe('403 recovery', () => {
  test.setTimeout(120000);

  test('a guarded route redirects to the explanation instead of dead-ending', async ({ page }) => {
    await gotoMaintainer(page);

    await expect(page).toHaveURL(FORBIDDEN_URL, { timeout: 60000 });
    await expect(page.locator('h1')).toContainText('Access denied');
    await expect(page.getByText('Error 403')).toBeVisible();

    const capability = page.locator('[data-testid="forbidden-capability"]');
    await expect(capability).toBeVisible();
    await expect(page.locator('[data-testid="forbidden-capability-label"]')).toHaveText(
      'Administer settings',
    );
    await expect(page.locator('[data-testid="forbidden-capability-code"]')).toHaveText(
      'settings:write',
    );
    await expect(page.locator('[data-testid="forbidden-required-role"]')).toContainText(
      'maintainer',
    );
    await expect(page.locator('[data-testid="forbidden-from"]')).toContainText('/maintainer');

    const access = page.locator('[data-testid="forbidden-request-access"]');
    await expect(access).toContainText('Settings → Roles');
    await expect(access).toContainText('browsing anonymously');
    await expect(access.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('the nav does not offer the maintainer console to an analyst', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('a[href="/maintainer"]')).toHaveCount(0);
    await expect(page.locator('a[href="/runs"]').first()).toBeVisible();
  });

  test('the back action returns to the previous page', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 60000 });

    await page.goto('/403?capability=roles:manage&from=%2Fsettings%2Froles', {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-testid="forbidden-back"]').click();
    await expect(page).toHaveURL(/\/settings$/, { timeout: 30000 });
  });

  test('the home action lands on the public landing page', async ({ page }) => {
    await page.goto('/403?capability=roles:manage&from=%2Fsettings%2Froles', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('link', { name: /Go home/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30000 });
  });

  test('renders a generic explanation without capability parameters', async ({ page }) => {
    await page.goto('/403', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toContainText('Access denied');
    await expect(page.locator('[data-testid="forbidden-capability"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="forbidden-request-access"]')).toBeVisible();
    await expect(page.locator('[data-testid="forbidden-back"]')).toBeVisible();
  });

  test('fails open when the role lookup itself is broken', async ({ page }) => {
    await page.route('**/api/settings/roles/me', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'role lookup unavailable' }),
      }),
    );

    await gotoMaintainer(page);

    // The mirror failed, so the guard defers to the server: the page renders
    // and any write it triggers is still authorized/denied by the API.
    await expect(page.locator('h1')).toContainText('Maintainer', { timeout: 60000 });
    await expect(page).not.toHaveURL(/\/403/);
  });
});
