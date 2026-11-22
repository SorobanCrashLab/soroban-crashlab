import { test, expect } from './fixtures';

test.describe('Integrations Hub navigation', () => {
  test.setTimeout(90000);

  test('should load integrations hub and navigate to key integration pages', async ({ page }) => {
    // Prefer DOM locators over getByRole: CI often marks page content as
    // accessibility-hidden while the nodes are still present in the document.
    await page.goto('/integrations', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/integrations\/?$/);
    await expect(page.locator('h1')).toContainText('Integrations Hub', { timeout: 60000 });

    await page.goto('/integrations/artifacts', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/integrations\/artifacts/);
    await expect(page.locator('h1')).toContainText('Artifact Storage', { timeout: 60000 });

    await page.goto('/integrations/replay-e2e', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/integrations\/replay-e2e/);
    await expect(page.locator('h2')).toContainText('Replay', { timeout: 60000 });
  });
});
