import { test, expect } from './fixtures';

test.describe('Maintainer Mode Toggling', () => {
  test('should toggle maintainer mode and show/hide the maintainer tab', async ({ page }) => {
    // Navigate to Settings page
    await page.goto('/settings');

    // Verify Settings heading
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify "Maintainer" link in navbar is NOT visible initially
    const maintainerNavLink = page.locator('nav a[href="/maintainer"]');
    await expect(maintainerNavLink).not.toBeVisible();

    // Find the toggle maintainer mode button
    const toggleButton = page.getByRole('switch', { name: 'Toggle maintainer mode' });
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveAttribute('aria-checked', 'false');

    // Click the toggle button to turn it on
    await toggleButton.click();

    // Verify the state is updated
    await expect(toggleButton).toHaveAttribute('aria-checked', 'true');

    // Verify the "Maintainer" link in navbar is now visible
    await expect(maintainerNavLink).toBeVisible();

    // Click on the maintainer nav link to test navigation
    await maintainerNavLink.click();

    // Verify that we are on the /maintainer page
    await expect(page).toHaveURL(/.*\/maintainer/, { timeout: 15000 });

    // Go back to Settings page
    await page.goto('/settings');

    // Toggle it off
    const toggleButtonOff = page.getByRole('switch', { name: 'Toggle maintainer mode' });
    await expect(toggleButtonOff).toHaveAttribute('aria-checked', 'true');
    await toggleButtonOff.click();

    // Verify it's off and nav link is gone
    await expect(toggleButtonOff).toHaveAttribute('aria-checked', 'false');
    await expect(maintainerNavLink).not.toBeVisible();
  });
});
