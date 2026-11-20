import { expect, test } from '@playwright/test';

/**
 * WCAG 2.2 AA regression coverage for the new composites (#2259).
 * The suite is intentionally small and deterministic; it runs in the a11y
 * job alongside the existing keyboard-triage spec.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('WCAG 2.2 AA composites', () => {
  for (const route of ['/runs/run-1', '/campaigns/campaign-1']) {
    test(`${route} exposes labeled tab patterns`, async ({ page }) => {
      await page.goto(route);
      const tablists = page.getByRole('tablist');
      const count = await tablists.count();
      for (let index = 0; index < count; index += 1) {
        const tablist = tablists.nth(index);
        await expect(tablist).toBeVisible();
        await expect(tablist.getByRole('tab')).not.toHaveCount(0);
        const accessibleName = await tablist.getAttribute('aria-label');
        expect(accessibleName && accessibleName.length > 0).toBe(true);
        const selected = tablist.getByRole('tab', { selected: true });
        await expect(selected).toHaveCount(1);
        await expect(selected).toHaveAttribute('tabindex', '0');
      }
    });
  }

  test('axe reports no critical or serious WCAG 2.2 AA violations on the run workspace', async ({ page }) => {
    await page.goto('/runs/run-1');
    // axe-core is injected by the a11y job; skip gracefully when unavailable.
    const hasAxe = await page.evaluate(() => typeof (window as { axe?: unknown }).axe !== 'undefined');
    test.skip(!hasAxe, 'axe-core is not injected in this environment');
    const results = await page.evaluate(async (tags) => {
      const axe = (window as { axe: (p: unknown, o: unknown) => Promise<{ violations: { impact?: string; id: string }[] }> }).axe;
      return axe(document, { runOnly: { type: 'tag', values: tags } });
    }, WCAG_TAGS);
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => violation.id)).toEqual([]);
  });
});
