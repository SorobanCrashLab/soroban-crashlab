import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };

const mockRuns = [
  {
    id: 'run-1001',
    status: 'completed',
    area: 'state',
    severity: 'high',
    duration: 180000,
    seedCount: 12500,
    crashDetail: null,
    cpuInstructions: 12300000,
    memoryBytes: 524288000,
    minResourceFee: 17500,
    queuedAt: '2026-05-31T09:00:00.000Z',
    startedAt: '2026-05-31T09:01:00.000Z',
    finishedAt: '2026-05-31T09:04:00.000Z',
  },
];

const fulfillRunsRequest = async (page: Page, body: unknown, status = 200) => {
  await page.route('**/api/runs', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname !== '/api/runs') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.describe('Mobile responsive layout', () => {
  test.use({ viewport: mobileViewport });

  test('shows hamburger navigation and drawer links on mobile', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();

    const desktopRunsLink = page.locator('header nav').getByRole('link', { name: /Runs/i });
    await expect(desktopRunsLink).toBeHidden();

    await page.getByRole('button', { name: 'Open navigation menu' }).click();

    const drawerRunsLink = page.locator('.drawer').getByRole('link', { name: 'Runs' });
    await expect(drawerRunsLink).toBeVisible();
    await expect(page.locator('.drawer').getByRole('link', { name: 'Dashboard' })).toBeVisible();

    await drawerRunsLink.click();

    await expect(page).toHaveURL(/\/runs$/);
    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();
  });

  test('keeps dashboard content within the mobile viewport width', async ({ page }) => {
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });

    const runsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.goto('/');
    await runsResponse;

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByRole('link', { name: 'View All Runs' })).toBeVisible();
    // The dashboard renders several tables; assert the first one is visible
    // rather than matching every table (strict-mode violation otherwise).
    await expect(page.getByRole('table').first()).toBeVisible();
  });

  test('closes the mobile drawer with the close button', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    await page.getByRole('button', { name: 'Close navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toHaveCount(0);
  });

  test('traps focus inside the mobile drawer while tabbing', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    // On open, focus moves to the first focusable element (the close button).
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();

    // Tab a few times — focus must always remain inside the drawer.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const isInsideDrawer = await page.evaluate(() => {
        return document.querySelector('.drawer')?.contains(document.activeElement) ?? false;
      });
      expect(isInsideDrawer).toBe(true);
    }
  });

  test('closes the drawer on Escape and restores focus to the hamburger', async ({ page }) => {
    await page.goto('/');

    const hamburger = page.getByRole('button', { name: 'Open navigation menu' });
    await hamburger.click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer.open')).toHaveCount(0);

    await expect(hamburger).toBeFocused();
  });

  test('closes navigation drawer with Escape key press', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer.open')).toHaveCount(0);
  });

  test('closes navigation drawer by clicking backdrop overlay', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.locator('.drawer.open')).toBeVisible();

    const backdrop = page.locator('.drawer-backdrop');
    if (await backdrop.isVisible()) {
      await backdrop.click();
      await expect(page.locator('.drawer.open')).toHaveCount(0);
    }
  });

  test('maintains responsive layout containment on narrow mobile (320px) and tablet (768px) viewports', async ({ page }) => {
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    let hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('uses compact, non-scrolling navigation throughout the tablet range', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const desktopNav = page.locator('header nav');
    await expect(desktopNav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden();

    const navDoesNotScroll = await desktopNav.evaluate((nav) => nav.scrollWidth <= nav.clientWidth);
    expect(navDoesNotScroll).toBe(true);
    await expect(desktopNav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('title', 'Dashboard');

    const tabletLabelVisible = await desktopNav.locator('.tablet-nav-label').first().isVisible();
    expect(tabletLabelVisible).toBe(false);
    await expect(page.locator('.tablet-search-label')).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(desktopNav.locator('.tablet-nav-label').first()).toBeVisible();
    await expect(page.locator('.tablet-search-label')).toBeVisible();
  });

  test('transitions navigation UI elements seamlessly when resizing from desktop to mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const desktopNav = page.locator('header nav');
    await expect(desktopNav).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
  });

  test('provides 44px minimum touch targets for interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const targets = [
      page.getByRole('button', { name: 'Open navigation menu' }),
      page.getByRole('button', { name: /Switch to (light|dark) mode/i }),
      page.getByRole('link', { name: 'View All Runs' }),
    ];

    for (const target of targets) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
