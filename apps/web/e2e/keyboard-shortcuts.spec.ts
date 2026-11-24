import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Keyboard shortcut cheatsheet overlay (#1658).
 *
 * The overlay is generated from the live command palette registry, opens on
 * `?`/`Ctrl+/`, is focus-trapped (Escape restores focus), supports search, and
 * executes commands on click.
 */

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

const fulfillRunsRequest = async (page: Page) => {
  await page.route('**/api/runs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: mockRuns, total: mockRuns.length }),
    });
  });
};

const cheatsheetTrigger = (page: Page) =>
  page.getByRole('button', { name: 'Open keyboard shortcuts cheatsheet' });

const cheatsheetDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Keyboard Shortcuts' });

/**
 * The cheatsheet and palette are deferred chrome (dynamic, client-only). The
 * trigger's appearance is the signal that their keydown listeners and registry
 * entries have mounted — pressing a chord immediately after `domcontentloaded`
 * is silently dropped.
 */
async function gotoWithCheatsheetMounted(page: Page) {
  await page.goto('/');
  await expect(cheatsheetTrigger(page)).toBeVisible();
}

test.describe('Keyboard shortcut cheatsheet', () => {
  test('opens with ? with dialog semantics and closes with Escape', async ({ page }) => {
    await gotoWithCheatsheetMounted(page);

    // The floating trigger button is visible; the overlay is closed.
    await expect(cheatsheetTrigger(page)).toBeVisible();
    await expect(cheatsheetDialog(page)).toBeHidden();

    // `?` = Shift+/ on a US keyboard.
    await page.keyboard.press('Shift+/');

    const dialog = cheatsheetDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // The registry-filter input is present and labelled.
    const searchbox = page.getByRole('searchbox', { name: 'Filter shortcuts and commands' });
    await expect(searchbox).toBeVisible();
    await expect(searchbox).toBeFocused();

    // Escape traps out and closes.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Escape restores focus to the trigger button', async ({ page }) => {
    await gotoWithCheatsheetMounted(page);

    const trigger = cheatsheetTrigger(page);
    await trigger.click();
    await expect(cheatsheetDialog(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(cheatsheetDialog(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('opens and closes with Ctrl+/ (Cmd+/ on macOS)', async ({ page }) => {
    await gotoWithCheatsheetMounted(page);

    // The app honours either modifier for the dedicated help chord.
    const toggleChord = process.platform === 'darwin' ? 'Meta+/' : 'Control+/';
    await page.keyboard.press(toggleChord);
    await expect(cheatsheetDialog(page)).toBeVisible();

    await page.keyboard.press(toggleChord);
    await expect(cheatsheetDialog(page)).toBeHidden();
  });

  test('search filters registry commands and click executes navigation', async ({ page }) => {
    await fulfillRunsRequest(page);
    await gotoWithCheatsheetMounted(page);

    await page.keyboard.press('Shift+/');

    // Commands come from the live palette registry — the navigation group
    // lists "Go to Runs" with its G, R chord.
    const dialog = cheatsheetDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Go to Runs')).toBeVisible();

    const searchbox = page.getByRole('searchbox', { name: 'Filter shortcuts and commands' });
    await searchbox.fill('Go to Runs');

    // The command row is a real action: clicking it executes navigation.
    const runCommand = dialog.getByRole('button', { name: /Go to Runs/ }).first();
    await runCommand.click();

    await expect(page).toHaveURL(/\/runs$/);
    await expect(cheatsheetDialog(page)).toBeHidden();
  });

  test('shows non-existent matches as an empty state', async ({ page }) => {
    await gotoWithCheatsheetMounted(page);
    await page.keyboard.press('Shift+/');

    const searchbox = page.getByRole('searchbox', { name: 'Filter shortcuts and commands' });
    await expect(cheatsheetDialog(page)).toBeVisible();
    await searchbox.fill('zzzz-no-such-thing');

    await expect(
      cheatsheetDialog(page).getByText(/No shortcuts or commands match/),
    ).toBeVisible();
  });
});