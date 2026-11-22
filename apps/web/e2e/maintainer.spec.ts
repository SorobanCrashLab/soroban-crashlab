import { test, expect } from './fixtures';

const MAINTAINER_STORAGE_KEY = 'crashlab:maintainer-mode';

test.describe('Maintainer Mode Toggling', () => {
  test.setTimeout(120000);

  test('should toggle maintainer mode and grant access to the maintainer route', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('h1')).toContainText('Settings', { timeout: 60000 });

    const toggle = page.locator('[data-testid="maintainer-mode-toggle"]');
    await expect(toggle).toBeAttached({ timeout: 60000 });
    await toggle.evaluate((el) => (el as HTMLButtonElement).click());
    await expect
      .poll(
        async () => page.evaluate((key) => localStorage.getItem(key), MAINTAINER_STORAGE_KEY),
        { timeout: 30000 },
      )
      .toBe('true');

    await page.goto('/maintainer', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/maintainer/);
    await expect(page.locator('h1')).toContainText('Maintainer', { timeout: 60000 });
  });

  test('denies maintainer dashboard content when mode is disabled', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.removeItem(key);
    }, MAINTAINER_STORAGE_KEY);

    await page.goto('/maintainer', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(
        async () => {
          const pathname = new URL(page.url()).pathname;
          if (pathname === '/') return 'denied';
          const count = await page.locator('h1', { hasText: 'Maintainer' }).count();
          return count === 0 ? 'denied' : 'allowed';
        },
        { timeout: 60000 },
      )
      .toBe('denied');
  });

  test('grants access to maintainer dashboard when mode is enabled via storage', async ({ page }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, 'true');
    }, MAINTAINER_STORAGE_KEY);

    await page.goto('/maintainer', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/maintainer/);
    await expect(page.locator('h1')).toContainText('Maintainer', { timeout: 60000 });
  });
});
