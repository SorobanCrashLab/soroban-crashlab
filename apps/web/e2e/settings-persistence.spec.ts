import { test, expect } from './fixtures';

const API_CONFIG_STORAGE_KEY = 'crashlab:api-config';

test.describe('Settings page localStorage persistence', () => {
  test.setTimeout(120000);

  test('persists API configuration across reload', async ({ page }) => {
    await page.goto('/settings/api', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('API Configuration', { timeout: 60000 });
    await expect(page.locator('#api-backend-url')).toBeAttached({ timeout: 60000 });

    await page.locator('#api-backend-url').fill('https://api.example.com');
    await page.locator('#api-rate-limit-max').fill('42');
    await page.locator('#api-rate-limit-window').fill('30');
    await page.locator('#api-config-save').click();

    await expect
      .poll(
        async () =>
          page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw).backendUrl : null;
          }, API_CONFIG_STORAGE_KEY),
        { timeout: 30000 },
      )
      .toBe('https://api.example.com');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#api-backend-url')).toHaveValue('https://api.example.com', {
      timeout: 60000,
    });
  });
});
