import { test, expect } from './fixtures';

test.describe('Integrations Hub navigation', () => {
  test('should load integrations hub and navigate to an integration page', async ({ page }) => {
    // Navigate to integrations hub
    await page.goto('/integrations');

    // Verify title and main heading
    await expect(page.getByRole('heading', { name: 'Integrations Hub' })).toBeVisible();

    // Find and click the Artifact Storage integration card
    const card = page.getByRole('heading', { name: 'Artifact Storage' });
    await expect(card).toBeVisible();
    await card.click();

    // Verify navigation to artifacts page
    await expect(page).toHaveURL(/.*\/integrations\/artifacts/);

    // Verify the integration subpage heading loads
    await expect(page.getByRole('heading', { name: 'Artifact Storage Integration' })).toBeVisible();
  });
});
