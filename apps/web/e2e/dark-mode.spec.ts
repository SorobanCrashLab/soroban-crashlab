import { test, expect } from './fixtures';

const THEME_STORAGE_KEY = 'crashlab:theme';

async function setThemePreference(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

test.describe('Dark mode toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setThemePreference(page, 'light');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggles dark mode from the navbar theme button', async ({ page }) => {
    const darkModeButton = page.getByRole('button', { name: 'Switch to dark mode' });
    await expect(darkModeButton).toBeVisible({ timeout: 15000 });

    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await darkModeButton.click();

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe('dark');

    await page.getByRole('button', { name: 'Switch to light mode' }).click();

    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe('light');
  });

  test('persists theme preference across reload', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe('dark');
  });

  test('persists theme preference across page navigation', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.goto('/runs');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

    await page.goto('/runs/query');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('uses theme-aware colors on the landing page in dark mode', async ({ page }) => {
    await setThemePreference(page, 'dark');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const openAppLink = page.getByRole('link', { name: 'Open App' }).first();
    await expect(openAppLink).toBeVisible();
    await expect(openAppLink).toHaveCSS('background-color', 'rgb(230, 230, 230)');
    await expect(openAppLink).toHaveCSS('color', 'rgb(12, 12, 12)');

    const sectionLabel = page.getByText('How it works').first();
    await expect(sectionLabel).toBeVisible();
    await expect(sectionLabel).toHaveCSS('color', 'rgb(230, 230, 230)');

    const footerGitHubLink = page.getByRole('link', { name: 'GitHub' }).first();
    await expect(footerGitHubLink).toBeVisible();
    await expect(footerGitHubLink).toHaveCSS('color', 'rgb(230, 230, 230)');
  });

  test('handles corrupted localStorage theme preference gracefully', async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.setItem(key, 'invalid_corrupted_theme');
    }, THEME_STORAGE_KEY);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeVisible();

    await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();

    const storedTheme = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
    expect(['light', 'dark']).toContain(storedTheme);
  });

  test('handles rapid consecutive theme toggles without state desynchronization', async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
    }

    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    const storedTheme = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
    expect(storedTheme).toBe(isDark ? 'dark' : 'light');
  });
});
