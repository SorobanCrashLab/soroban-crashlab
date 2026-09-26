import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Guided product tour e2e coverage.
 *
 * The shared fixtures preseed the tour as dismissed so existing specs never see
 * the overlay; these tests explicitly re-enable it by re-registering an init
 * script that clears the dismissal (the later-registered script wins).
 */

const TOUR_DISMISSED_KEY = 'crashlab:product-tour-dismissed:v1';

const TOUR_ANCHORS = {
  'upload-artifact': 'start-run',
  'run-detail': 'nav-runs',
  'crash-cluster': 'clusters',
  'triage-board': 'triage',
  schedules: 'nav-schedules',
} as const;

const TOUR_TITLES = [
  'Upload your artifact',
  'Inspect your runs',
  'Crashes cluster by signature',
  'Triage on the board',
  'Automate with schedules',
];

const mockRuns = [
  {
    id: 'run-2001',
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
  {
    id: 'run-2002',
    status: 'failed',
    area: 'auth',
    severity: 'critical',
    duration: 240000,
    seedCount: 18200,
    crashDetail: {
      failureCategory: 'authorization',
      signature: 'auth-overflow',
      payload: 'AAAA',
      replayAction: 'soroban test --replay run-2002',
    },
    cpuInstructions: 15200000,
    memoryBytes: 629145600,
    minResourceFee: 22000,
    queuedAt: '2026-05-31T09:05:00.000Z',
    startedAt: '2026-05-31T09:06:00.000Z',
    finishedAt: '2026-05-31T09:10:00.000Z',
  },
  {
    id: 'run-2003',
    status: 'running',
    area: 'budget',
    severity: 'medium',
    duration: 90000,
    seedCount: 9800,
    crashDetail: null,
    cpuInstructions: 8100000,
    memoryBytes: 419430400,
    minResourceFee: 14250,
    queuedAt: '2026-05-31T09:15:00.000Z',
    startedAt: '2026-05-31T09:16:00.000Z',
  },
];

const enableTour = async (page: Page) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'false');
  }, TOUR_DISMISSED_KEY);
};

const fulfillRunsRequest = async (page: Page, body: unknown) => {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
};

test.describe('Guided product tour', () => {
  test.beforeEach(async ({ page }) => {
    await enableTour(page);
    await fulfillRunsRequest(page, { runs: mockRuns, total: mockRuns.length });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('walks the full loop from upload to schedules and persists dismissal', async ({ page }) => {
    await page.goto('/dashboard');

    const dialog = page.getByTestId('product-tour-dialog');
    const next = page.getByTestId('product-tour-next');

    // Step 1 — upload artifact.
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('product-tour-title')).toHaveText(TOUR_TITLES[0]);
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page.locator(`[data-tour="${TOUR_ANCHORS['upload-artifact']}"]`)).toBeAttached();
    await expect(page.getByTestId('product-tour-spotlight')).toBeAttached();
    await expect(page.getByTestId('product-tour-progress-bar')).toHaveAttribute('style', /width: 20%/);

    // Walk steps 2..5, asserting each anchor exists (guards against UI drift).
    for (const title of TOUR_TITLES.slice(1)) {
      await next.click();
      await expect(page.getByTestId('product-tour-title')).toHaveText(title);
      const step = TOUR_TITLES.indexOf(title) + 1;
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
      const anchorId = TOUR_ANCHORS[titleToId(title)];
      await expect(page.locator(`[data-tour="${anchorId}"]`)).toBeAttached();
    }

    // Finish (last step) dismisses and persists the dismissal durably.
    await expect(page.getByTestId('product-tour-next')).toHaveText('Finish');
    await next.click();
    await expect(dialog).toHaveCount(0);

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), TOUR_DISMISSED_KEY))
      .toBe('true');

    // Reload: the tour stays dismissed.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-tour-dialog')).toHaveCount(0);
  });

  test('skipping dismisses the tour durably', async ({ page }) => {
    await page.goto('/dashboard');

    const dialog = page.getByTestId('product-tour-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Skip the tour' }).click();
    await expect(dialog).toHaveCount(0);

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), TOUR_DISMISSED_KEY))
      .toBe('true');
  });

  test('back navigation is disabled on the first step and moves backward later', async ({ page }) => {
    await page.goto('/dashboard');

    const dialog = page.getByTestId('product-tour-dialog');
    const prev = page.getByTestId('product-tour-prev');
    const next = page.getByTestId('product-tour-next');

    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(prev).toBeDisabled();

    await next.click();
    await expect(page.getByTestId('product-tour-title')).toHaveText(TOUR_TITLES[1]);
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect(page.getByTestId('product-tour-title')).toHaveText(TOUR_TITLES[0]);
  });

  test('exposes accessible dialog semantics', async ({ page }) => {
    await page.goto('/dashboard');

    const dialog = page.getByTestId('product-tour-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'product-tour-title');
    await expect(dialog).toHaveAttribute('aria-describedby', 'product-tour-body');

    // Escape dismisses the tour.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('does not appear when already dismissed', async ({ page }) => {
    // The shared fixtures preseed the dismissal, so a plain dashboard visit
    // must not show the overlay.
    await page.goto('/dashboard');
    await expect(page.getByTestId('product-tour-dialog')).toHaveCount(0, { timeout: 10000 });
  });
});

function titleToId(title: string): keyof typeof TOUR_ANCHORS {
  const match = {
    [TOUR_TITLES[0]]: 'upload-artifact',
    [TOUR_TITLES[1]]: 'run-detail',
    [TOUR_TITLES[2]]: 'crash-cluster',
    [TOUR_TITLES[3]]: 'triage-board',
    [TOUR_TITLES[4]]: 'schedules',
  } as const;
  return match[title as (typeof TOUR_TITLES)[number]];
}