import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Regression guard for #1880: clicking every capability-gated control while
 * signed in as an analyst must never send the write request that the server
 * would answer with `FORBIDDEN_INSUFFICIENT_ROLE`. The gate is capability
 * driven, so enabling the local maintainer-mode escape hatch must not reopen
 * a path to the 403.
 */

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
];

const MUTATING_GATED_PATH =
  /^\/api\/(?:settings\/(?:roles|tokens|notifications|alerting|sentry)|runs\/[^/]+\/(?:replay|annotations|issues|tags))/;

interface ForbiddenWatch {
  forbiddenResponses: string[];
  gatedMutations: string[];
}

function watchForbiddenWrites(page: Page): ForbiddenWatch {
  const forbiddenResponses: string[] = [];
  const gatedMutations: string[] = [];

  page.on('response', (response) => {
    if (response.status() !== 403) return;
    const path = new URL(response.url()).pathname;
    void response
      .json()
      .then((body: { error?: { code?: string } }) => {
        if (body?.error?.code === 'FORBIDDEN_INSUFFICIENT_ROLE') {
          forbiddenResponses.push(`${response.request().method()} ${path}`);
        }
      })
      .catch(() => {
        // Not every 403 body is JSON; those are not capability denials.
      });
  });

  page.on('request', (request) => {
    if (request.method() === 'GET') return;
    const path = new URL(request.url()).pathname;
    if (MUTATING_GATED_PATH.test(path)) {
      gatedMutations.push(`${request.method()} ${path}`);
    }
  });

  return { forbiddenResponses, gatedMutations };
}

async function mockRunsRequest(page: Page) {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: mockRuns, total: mockRuns.length }),
    });
  });
}

async function walkGatedControls(page: Page) {
  await page.goto('/settings/roles', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="capability-matrix"]')).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator('[data-testid="capability-granted-roles:manage"]')).toHaveText(
    'Denied',
  );
  await expect(page.locator('[data-testid="capability-granted-runs:annotate"]')).toHaveText(
    'Granted',
  );
  const assign = page.getByRole('button', { name: 'Assign Role' });
  await expect(assign).toBeDisabled();
  await expect(page.locator('[data-testid="gate-note-roles:manage"]')).toContainText(
    'requires the maintainer role',
  );

  await page.goto('/settings/api', { waitUntil: 'domcontentloaded' });
  const createToken = page.locator('#create-token-submit');
  await expect(createToken).toBeDisabled({ timeout: 60000 });
  await expect(page.locator('#tokens-gate-note')).toContainText(
    'requires the maintainer role',
  );

  await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });
  const savePreferences = page.getByRole('button', { name: 'Save Preferences' });
  await expect(savePreferences).toBeDisabled({ timeout: 60000 });
  await expect(page.locator('[data-testid="gate-note-settings:write"]')).toContainText(
    'requires the maintainer role',
  );

  await mockRunsRequest(page);
  await page.goto('/runs', { waitUntil: 'domcontentloaded' });
  const table = page.getByRole('region', { name: 'Virtualized fuzzing run table' });
  await expect(table.locator('tbody tr')).toHaveCount(mockRuns.length, { timeout: 60000 });

  await page.locator('thead input[type="checkbox"]').first().click();
  await expect(page.locator('[data-testid="bulk-action-toolbar"]')).toBeVisible();

  await page.getByRole('button', { name: /Bulk Actions/ }).click();
  const menu = page.getByRole('menu');
  const deleteItem = menu.getByRole('menuitem', { name: /^Delete/ });
  await expect(deleteItem).toBeDisabled();
  await expect(deleteItem).toContainText('Requires the maintainer role.');
  await expect(menu.getByRole('menuitem', { name: /^Tag/ })).toBeEnabled();
}

test.describe('No capability 403s while clicking gated UI', () => {
  test.setTimeout(180000);

  for (const localMode of [false, true]) {
    test(`analyst session — local maintainer mode ${localMode ? 'on' : 'off'}`, async ({
      page,
    }) => {
      if (localMode) {
        await page.addInitScript(() => {
          window.localStorage.setItem('crashlab:maintainer-mode', 'true');
        });
      }

      const watch = watchForbiddenWrites(page);
      await walkGatedControls(page);

      // Let any in-flight response handlers settle before asserting the walk
      // produced no forbidden write attempt.
      await page.waitForTimeout(500);
      expect(watch.forbiddenResponses).toEqual([]);
      expect(watch.gatedMutations).toEqual([]);
    });
  }
});
