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
];

const fulfillRunsRequest = async (page: Page) => {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: mockRuns, total: mockRuns.length }),
    });
  });
};

test.describe('Search / Query Builder functionality', () => {
  test.beforeEach(async ({ page }) => {
    await fulfillRunsRequest(page);
  });

  test('should navigate to search page from navbar and builder filters/saves queries', async ({ page }) => {
    await page.goto('/');
    
    // 1. Navigation from navbar
    const searchBtn = page.locator('#navbar-search-link');
    await expect(searchBtn).toBeVisible();
    await searchBtn.click();
    
    await expect(page).toHaveURL(/.*\/runs\/query/);
    await expect(page.getByRole('heading', { name: 'Fuzzy Query Builder', level: 1 })).toBeVisible();

    // 2. Add filter
    const addFilterBtn = page.getByRole('button', { name: '+ Add Filter' });
    await expect(addFilterBtn).toBeVisible();
    await addFilterBtn.click();

    // Verify first filter select is field select
    const fieldSelect = page.locator('select').first();
    await expect(fieldSelect).toBeVisible();
    await fieldSelect.selectOption('status');

    // Select the operator
    const operatorSelect = page.locator('select').nth(1);
    await expect(operatorSelect).toBeVisible();
    await operatorSelect.selectOption('equals');

    // Select the status value select
    const valueSelect = page.locator('select').nth(2);
    await expect(valueSelect).toBeVisible();
    await valueSelect.selectOption('completed');

    // 3. Save query
    const saveQueryBtn = page.getByRole('button', { name: 'Save Query' });
    await expect(saveQueryBtn).toBeVisible();
    await saveQueryBtn.click();

    // Type query name in dialog
    const nameInput = page.getByPlaceholder('Query name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Completed Runs Query');

    // Click Save button in dialog
    const saveBtn = page.getByRole('button', { name: 'Save', exact: true });
    await saveBtn.click();

    // Verify saved query is shown in sidebar
    await expect(page.getByText('Completed Runs Query')).toBeVisible();

    // 4. Persistence check
    await page.reload();
    await expect(page.getByText('Completed Runs Query')).toBeVisible();
  });
});
