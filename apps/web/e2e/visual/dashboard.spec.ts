import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { mockRuns, waitForFonts } from './seed';

/**
 * Visual regression coverage for the triage dashboard critical paths.
 *
 * For a dashboard whose product *is* a table of crash runs, "the flow worked"
 * is not the same as "the row is visible": clipped columns, contrast
 * regressions and broken responsive layouts all pass a functional assertion.
 * These specs bless the rendering of the five paths a maintainer actually
 * stares at:
 *
 *   - runs list          /runs
 *   - run detail         /runs/[id]
 *   - crash cluster      /analytics/clusters
 *   - replay history     /runs/[id]/replay-history
 *   - settings + auth    /settings, /integrations/auth
 *
 * Baselines are committed under `e2e/visual.spec.ts-snapshots/` and are keyed
 * by `{arg}-{projectName}`, so every screenshot name here must be globally
 * unique. The spec runs on the chromium project only (the CI project) so the
 * baseline stays reproducible; see `playwright.visual.config.ts`.
 */

const THEME_STORAGE_KEY = 'crashlab:theme';

const desktopViewport = { width: 1280, height: 720 };
const mobileViewport = { width: 390, height: 844 };

type Theme = 'light' | 'dark';

const THEMES: Theme[] = ['light', 'dark'];

async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

/**
 * Shared preamble: disable motion, pin the theme, navigate and let fonts
 * settle. Callers then assert page-specific readiness before snapshotting.
 */
async function openPage(
  page: Page,
  path: string,
  theme: Theme,
  options: { mobile?: boolean } = {},
) {
  await page.setViewportSize(options.mobile ? mobileViewport : desktopViewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setTheme(page, theme);
  await page.goto(path);
  await waitForFonts(page);
}

test.describe('Runs list visual', () => {
  for (const theme of THEMES) {
    test(`runs list in ${theme} theme`, async ({ page }) => {
      await mockRuns(page);
      await openPage(page, '/runs', theme);

      await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible({
        timeout: 15000,
      });
      await expect(
        page.getByRole('region', { name: 'Virtualized fuzzing run table' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'run-2002' }),
      ).toBeVisible();

      await expect(page).toHaveScreenshot(`runs-list-${theme}.png`);
    });
  }

  test('runs list on mobile in light theme', async ({ page }) => {
    await mockRuns(page);
    await openPage(page, '/runs', 'light', { mobile: true });

    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole('region', { name: 'Virtualized fuzzing run table' }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot('runs-list-mobile-light.png');
  });
});

test.describe('Run detail visual', () => {
  // The run detail page renders from the deterministic server fixture
  // (`buildMockRuns()`), so no network mock is required. run-1002 exists in
  // that fixture.
  for (const theme of THEMES) {
    test(`run detail in ${theme} theme`, async ({ page }) => {
      await openPage(page, '/runs/run-1002', theme);

      await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText('ID: run-1002')).toBeVisible();

      await expect(page).toHaveScreenshot(`run-detail-${theme}.png`);
    });
  }

  test('run detail on mobile in light theme', async ({ page }) => {
    await openPage(page, '/runs/run-1002', 'light', { mobile: true });

    await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible({
      timeout: 15000,
    });

    await expect(page).toHaveScreenshot('run-detail-mobile-light.png');
  });
});

test.describe('Crash cluster visual', () => {
  for (const theme of THEMES) {
    test(`failure clusters in ${theme} theme`, async ({ page }) => {
      await mockRuns(page, { nested: true });
      await openPage(page, '/analytics/clusters', theme);

      await expect(
        page.getByRole('heading', { name: 'Failure Signature Clustering' }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('heading', { name: 'Failure Clusters' })).toBeVisible();

      await expect(page).toHaveScreenshot(`crash-cluster-${theme}.png`);
    });
  }
});

test.describe('Replay history visual', () => {
  for (const theme of THEMES) {
    test(`replay history in ${theme} theme`, async ({ page }) => {
      await openPage(page, '/runs/run-1002/replay-history', theme);

      await expect(page.getByRole('heading', { name: 'Replay History', level: 1 })).toBeVisible({
        timeout: 15000,
      });

      await expect(page).toHaveScreenshot(`replay-history-${theme}.png`);
    });
  }
});

test.describe('Settings and auth visual', () => {
  for (const theme of THEMES) {
    test(`settings in ${theme} theme`, async ({ page }) => {
      await openPage(page, '/settings', theme);

      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('maintainer-mode-toggle')).toBeVisible();

      await expect(page).toHaveScreenshot(`settings-${theme}.png`);
    });
  }

  test('external authentication settings in light theme', async ({ page }) => {
    await openPage(page, '/integrations/auth', 'light');

    await expect(
      page.getByRole('heading', { name: 'External Authentication Integration' }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page).toHaveScreenshot('settings-auth-light.png');
  });
});
