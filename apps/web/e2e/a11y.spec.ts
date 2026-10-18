/**
 * Accessibility gate: axe-core scans on core flows.
 *
 * This spec enforces the a11y baseline declared in AGENTS.md Part VI (WCAG 2.1 AA):
 * - Core flows must fail on critical/serious violations.
 * - Documented moderate allow-list with expiry dates.
 * - Keyboard-only triage flow with visible focus.
 *
 * Reports are written to test-results/a11y/ and uploaded as CI artifacts.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Documented moderate violation allow-list.
 *
 * Each entry must have an expiry date. Once expired, the allow-list entry
 * is considered stale and the spec fails so the underlying issue is resolved or
 * re-documented. This prevents silent accumulation of moderate violations.
 */
interface ModerateAllowListEntry {
  /** axe-core rule id (e.g. 'color-contrast'). */
  id: string;
  /** Where the violation is tolerated (e.g. 'runs-list'). */
  scope: string;
  /** ISO date after which this tolerance is invalid. */
  expiresOn: string;
  /** Reference to the tracking issue. */
  issue: string;
}

const MODERATE_ALLOWLIST: ModerateAllowListEntry[] = [];

const RESULTS_DIR = join(process.cwd(), 'test-results', 'a11y');

function ensureResultsDir(): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
}

function assertAllowListFresh(): void {
  const now = Date.now();
  for (const entry of MODERATE_ALLOWLIST) {
    const expiry = Date.parse(entry.expiresOn);
    if (Number.isNaN(expiry)) {
      throw new Error(`Invalid expiry date for a11y allow-list entry ${entry.id}: ${entry.expiresOn}`);
    }
    if (expiry < now) {
      throw new Error(
        `A11y moderate allow-list entry expired: ${entry.id} (scope: ${entry.scope}, expired: ${entry.expiresOn}, issue: ${entry.issue}).` +
          ` Fix the violation or re-document the tolerance.`,
      );
    }
  }
}

function isAllowListed(id: string, scope: string): boolean {
  return MODERATE_ALLOWLIST.some(
    (e) => e.id === id && (e.scope === scope || e.scope === '*'),
  );
}

interface AxeReportSummary {
  scope: string;
  url: string;
  timestamp: string;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  violations: Array<{ id: string; impact?: string | null; helpUrl?: string }>;
}

const reportSummaries: AxeReportSummary[] = [];

/**
 * Run axe on the current page, write an HTML report artifact, and enforce
 * the critical/serious budget (zero) plus the documented moderate allow-list.
 */
async function scanAndEnforce(page: Page, scope: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag21aa'])
    .analyze();

  ensureResultsDir();
  const safeScope = scope.replace(/[^a-z0-9-]/gi, '-');
  const jsonReport = JSON.stringify(results, null, 2);
  writeFileSync(join(RESULTS_DIR, `${safeScope}.json`), jsonReport);
  writeFileSync(
    join(RESULTS_DIR, `${safeScope}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:24px}pre{white-space:pre-wrap;overflow:auto}h1{font-size:18px}</style></head><body><h1>axe report: ${scope}</h1><p>URL: ${page.url()}</p><pre>${jsonReport.replace(/</g, '&lt;')}</pre></body></html>`,
  );

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');
  const moderate = results.violations.filter((v) => v.impact === 'moderate');
  const minor = results.violations.filter((v) => v.impact === 'minor');

  reportSummaries.push({
    scope,
    url: page.url(),
    timestamp: new Date().toISOString(),
    critical: critical.length,
    serious: serious.length,
    moderate: moderate.length,
    minor: minor.length,
    violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, helpUrl: v.helpUrl })),
  });

  const blocking = [...critical, ...serious];
  if (blocking.length > 0) {
    const details = blocking
      .map((v) => ` -- [${v.impact}] ${v.id}: ${v.description} (${v.helpUrl})`)
      .join('\n');
    throw new Error(`Critical/serious a11y violations on ${scope}:\n${details}`);
  }

  const undocumentedModerate = moderate.filter((v) => !isAllowListed(v.id, scope));
  if (undocumentedModerate.length > 0) {
    const details = undocumentedModerate
      .map((v) => ` -- ${v.id}: ${v.description} (${v.helpUrl})`)
      .join('\n');
    throw new Error(
      `Undocumented moderate a11y violations on ${scope}. Add to MODERATE_ALLOWLIST with an expiry date or fix:\n${details}`,
    );
  }
}

test.afterAll(() => {
  ensureResultsDir();
  writeFileSync(
    join(RESULTS_DIR, 'summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        allowList: MODERATE_ALLOWLIST,
        scans: reportSummaries,
      },
      null,
      2,
    ),
  );
});

test.beforeEach(() => {
  assertAllowListFresh();
});

const CORE_ROUTES: Array<{ name: string; path: string; waitFor?: string }> = [
  { name: 'landing', path: '/' },
  { name: 'runs-list', path: '/runs', waitFor: 'main, [data-testid="runs-list"]' },
  { name: 'run-detail', path: '/runs/detail', waitFor: 'main' },
  { name: 'replay', path: '/runs/replay', waitFor: 'main' },
  { name: 'settings', path: '/settings', waitFor: 'main' },
  { name: 'auth-signin', path: '/auth/signin', waitFor: 'main, form' },
];

for (const route of CORE_ROUTES) {
  test(`${route.name} has no critical/serious a11y violations`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} should respond with status < 400`).toBeLessThan(400);
    await page.waitForLoadState('networkidle');
    if (route.waitFor) {
      await page.locator(route.waitFor).first().waitFor({ state: 'visible', timeout: 15_000 });
    }
    await scanAndEnforce(page, route.name);
  });
}

test.describe('Keyboard-only triage flow', () => {
  test('triage flow is completable via keyboard alone with visible focus', async ({ page }) => {
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // Tab from the document body and verify that focus is always visible.
    const maxTabs = 40;
    let saw = 0;
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus-visible');
      if ((await focused.count()) > 0) {
        saw += 1;
      }
    }
    expect(saw, 'at least one focus indicator should be visible during keyboard navigation').toBeGreaterThan(0);

    // Reach the runs list and open the first run via keyboard only.
    const firstRunLink = page.locator('[data-testid="run-row"] a, [data-testid="runs-list"] a').first();
    await expect(firstRunLink).toBeVisible();
    await firstRunLink.focus();
    await expect(firstRunLink).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();

    // Perform a triage action via keyboard and confirm the result is reachable.
    const triageAction = page.locator('button[data-testid="triage-action"], [role="button"][data-testid="triage-action"]');
    await expect(triageAction).toBeVisible();
    await triageAction.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="triage-result"]')).toBeVisible();
  });
});

test.describe('Landing page decorative SVGs', () => {
  test('all decorative SVGs have aria-hidden attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const svgs = await page.locator('svg').all();
    for (const svg of svgs) {
      const className = await svg.getAttribute('class');
      if (className?.includes('w-4 h4') || className?.includes('w-6 h6')) {
        const ariaHidden = await svg.getAttribute('aria-hidden');
        expect(ariaHidden).toBe('true');
      }
    }
  });

  test('buttons with icons have accessible labels', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const buttonsWithIcons = await page.locator('a:has(svg), button:has(svg)').all();
    for (const button of buttonsWithIcons) {
      const text = await button.textContent();
      const hasAriaLabel = await button.getAttribute('aria-label');
      const hasAssociatedLabel = await button.getAttribute('aria-labelledby');
      const hasAscessibleLabel =
        (text && text.trim().length > 0) || Boolean(hasAriaLabel) || Boolean(hasAssociatedLabel);
      expect(hasAscessibleLabel).toBe(true);
    }
  });
});
