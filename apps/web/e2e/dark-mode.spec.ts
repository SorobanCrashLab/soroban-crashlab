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
    await page.waitForLoadState('networkidle');
  });

  test('toggles dark mode from the navbar theme button', async ({ page }) => {
    const darkModeButton = page.getByRole('button', { name: 'Switch to dark mode' });
    await expect(darkModeButton).toBeVisible();

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
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe('dark');
  });
});
