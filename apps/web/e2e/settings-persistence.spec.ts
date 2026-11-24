import { test, expect } from './fixtures';

const API_CONFIG_STORAGE_KEY = 'crashlab:api-config';

test.describe('Settings page localStorage persistence', () => {
  test.setTimeout(120000);

  test('persists API configuration across reload', async ({ page }) => {
    await page.goto('/settings/api', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'API Configuration', level: 1 }),
    ).toBeVisible({ timeout: 60000 });

    // The form is present in the server HTML, but its React state and handlers
    // only exist once the client-only status card renders. Filling earlier is
    // silently overwritten by the initial state on hydration.
    await expect(page.getByText(/API (not )?configured/i)).toBeVisible({ timeout: 60000 });

    const backendUrl = page.getByRole('textbox', { name: 'Backend API URL' });
    const maxRequests = page.getByRole('spinbutton', { name: 'Rate Limit — Max Requests' });
    const windowSeconds = page.getByRole('spinbutton', {
      name: 'Rate Limit — Window (seconds)',
    });

    await backendUrl.fill('https://api.example.com');
    await maxRequests.fill('42');
    await windowSeconds.fill('30');
    await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
    await page.getByRole('button', { name: 'Save configuration' }).click();

    await expect
      .poll(
        async () =>
          page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const config = JSON.parse(raw) as Record<string, unknown>;
            return {
              backendUrl: config.backendUrl,
              rateLimitMaxRequests: config.rateLimitMaxRequests,
              rateLimitWindowSeconds: config.rateLimitWindowSeconds,
            };
          }, API_CONFIG_STORAGE_KEY),
        { timeout: 30000 },
      )
      .toEqual({
        backendUrl: 'https://api.example.com',
        rateLimitMaxRequests: 42,
        rateLimitWindowSeconds: 30,
      });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/API configured/i)).toBeVisible({ timeout: 60000 });
    await expect(backendUrl).toHaveValue('https://api.example.com', { timeout: 60000 });
    await expect(maxRequests).toHaveValue('42');
    await expect(windowSeconds).toHaveValue('30');
  });
});
