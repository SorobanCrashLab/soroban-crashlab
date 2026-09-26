import { test, expect } from './fixtures';

/**
 * Visual regression coverage for the landing page and Start flow.
 *
 * Baselines are committed for the chromium project only (the CI project),
 * so the spec is skipped on other local browsers. Screenshots use the
 * reduced-motion path so scroll reveals render at their static final states
 * instead of mid-animation.
 */

const THEME_STORAGE_KEY = 'crashlab:theme';

const desktopViewport = { width: 1280, height: 720 };
const mobileViewport = { width: 390, height: 844 };

type Theme = 'light' | 'dark';

const THEMES: Theme[] = ['light', 'dark'];

const ONLY_CHROMIUM_SKIP = 'Visual baselines are committed for chromium only';

async function setTheme(page: import('@playwright/test').Page, theme: Theme) {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

test.describe('Landing page visual', () => {
  for (const theme of THEMES) {
    test(`hero above the fold in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('link', { name: 'Open App' }).first()).toBeVisible();
      await expect(page.getByText('How it works').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-hero-${theme}.png`);
    });

    test(`how-it-works section in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/');
      const heading = page.getByText('From WASM to triaged crash', { exact: false }).first();
      await expect(heading).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('It mutates, executes, watches').first()).toBeVisible();
      const section = page.getByText('From WASM to triaged crash', { exact: false }).locator('xpath=ancestor::section').first();
      await expect(section).toHaveScreenshot(`landing-how-it-works-${theme}.png`);
    });

    test(`sandbox demo section in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/');
      const section = page.getByRole('region', { name: 'Sandbox demo' });
      await expect(section).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('sandbox-demo')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play demo' })).toBeVisible();
      await expect(section).toHaveScreenshot(`landing-sandbox-${theme}.png`);
    });

    test(`features and bottom CTA in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/');
      const cta = page.getByText('Ready to break your contracts?', { exact: true }).first();
      await expect(cta).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('link', { name: 'Open App' }).last()).toBeVisible();
      await expect(page.locator('footer')).toBeVisible();
      const ctaSection = page.getByText('Ready to break your contracts?', { exact: true }).locator('xpath=ancestor::section').first();
      await expect(ctaSection).toHaveScreenshot(`landing-cta-footer-${theme}.png`);
    });

    test(`mobile view of the hero in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.setViewportSize(mobileViewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-mobile-hero-${theme}.png`);
    });
  }
});

test.describe('Start flow visual', () => {
  test.use({ viewport: desktopViewport });

  for (const theme of THEMES) {
    test(`upload step in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/start');
      await expect(page.getByRole('heading', { name: 'Step 1 — Upload your contract' })).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#start-wasm-file')).toBeVisible();
      await expect(page.getByText('Maximum size: 16MB. Only .wasm files are accepted.')).toBeVisible();
      await expect(page).toHaveScreenshot(`start-upload-${theme}.png`);
    });

    test(`mobile view of the upload step in ${theme} theme`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM_SKIP);
      await page.setViewportSize(mobileViewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setTheme(page, theme);
      await page.goto('/start');
      await expect(page.getByRole('heading', { name: 'Step 1 — Upload your contract' })).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#start-wasm-file')).toBeVisible();
      await expect(page).toHaveScreenshot(`start-mobile-upload-${theme}.png`);
    });
  }
});