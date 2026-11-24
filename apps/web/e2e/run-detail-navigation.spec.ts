import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

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
  {
    id: 'run-1002',
    status: 'failed',
    area: 'auth',
    severity: 'critical',
    duration: 240000,
    seedCount: 18200,
    crashDetail: {
      failureCategory: 'authorization',
      signature: 'auth-overflow',
      payload: 'AAAA',
      replayAction: 'soroban test --replay run-1002',
    },
    cpuInstructions: 15200000,
    memoryBytes: 629145600,
    minResourceFee: 22000,
    queuedAt: '2026-05-31T09:05:00.000Z',
    startedAt: '2026-05-31T09:06:00.000Z',
    finishedAt: '2026-05-31T09:10:00.000Z',
  },
  {
    id: 'run-1003',
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

/** The runs route now returns its payload under `data` (with a top-level total). */
const runsEnvelope = (runs: typeof mockRuns) => ({
  data: { runs, total: runs.length },
  total: runs.length,
});

const fulfillRunsListRequest = async (page: Page, body: unknown, status = 200) => {
  await page.route(/\/api\/runs(?:\?|$)/, async (route) => {
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

const openRunFromList = async (page: Page, runId: string) => {
  await fulfillRunsListRequest(page, runsEnvelope(mockRuns));

  const runsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
  );

  await page.goto('/runs');
  await runsResponse;

  await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();

  const tableContainer = page.getByRole('region', { name: 'Virtualized fuzzing run table' });
  const grid = tableContainer.getByRole('grid', { name: 'Fuzzing runs' });
  const targetRow = grid.getByRole('row').filter({ hasText: runId });
  await expect(targetRow).toHaveCount(1);
  await targetRow.getByRole('button', { name: runId }).click();

  await expect(page).toHaveURL(new RegExp(`/runs/${runId.replace(/-/g, '\\-')}$`));
};

test.describe('Run detail navigation', () => {
  test('navigates from runs list to run detail page', async ({ page }) => {
    await openRunFromList(page, 'run-1002');

    await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
    await expect(page.getByText('ID: run-1002')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toBeVisible();
  });

  test('navigates from dashboard to run detail page on row click', async ({ page }) => {
    await fulfillRunsListRequest(page, runsEnvelope(mockRuns));

    const runsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.status() === 200,
    );

    await page.goto('/dashboard');
    await runsResponse;

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Two tables are labelled exactly "Recent fuzzing runs"; the first is the layout section.
    const recentRunsTable = page
      .getByRole('table', { name: 'Recent fuzzing runs', exact: true })
      .first();
    const targetRow = recentRunsTable.getByRole('row', {
      name: /Fuzzing run run-1002\b/,
    });
    await expect(targetRow).toBeVisible();
    // The sticky Quick Actions card can overlap the table row; activate the
    // row through its keyboard handler instead of a pointer click.
    await targetRow.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/runs\/run-1002$/);
    await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
    await expect(page.getByText('ID: run-1002')).toBeVisible();

    await page.getByRole('link', { name: 'Back to Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('navigates back from run detail to runs list', async ({ page }) => {
    await openRunFromList(page, 'run-1001');

    await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
    await expect(page.getByText('ID: run-1001')).toBeVisible();
    await expect(page.getByText('Issues found').first()).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Runs' })
      .click();

    await expect(page).toHaveURL(/\/runs$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Fuzzing Runs' })).toBeVisible();
  });

  test('links to dashboard from run detail page', async ({ page }) => {
    await openRunFromList(page, 'run-1001');

    await page.getByRole('link', { name: 'Back to Dashboard' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('handles dashboard connection error when API request fails', async ({ page }) => {
    await fulfillRunsListRequest(page, { message: 'Internal Server Error' }, 500);

    await page.goto('/dashboard');
    await expect(page.getByText('Connection Error')).toBeVisible();
    await expect(page.getByText('Could not reach the backend API.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('handles navigation to unknown run detail page gracefully', async ({ page }) => {
    await fulfillRunsListRequest(page, runsEnvelope(mockRuns));

    await page.goto('/runs/non-existent-run-9999');
    await page.waitForLoadState('domcontentloaded');

    // Unknown ids are rejected by the detail route's notFound() guard.
    await expect(page.getByRole('heading', { name: 'This route slipped past the fuzzer' })).toBeVisible();
    await expect(page.getByText('Error 404')).toBeVisible();
    await expect(page.getByText('/runs/non-existent-run-9999')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open runs' })).toBeVisible();
  });
});
