/**
 * Accessibility tests for the landing page.
 * 
 * These tests verify that the landing page meets basic accessibility requirements,
 * including proper ARIA attributes on SVG elements and button labels.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Landing page accessibility', () => {
  test('landing page has no critical accessibility violations', async ({ page }) => {
    // Navigate to the landing page
    await page.goto('/');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Run axe accessibility checks
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    // Get only critical and serious violations (ignore warnings)
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    // Assert no critical violations
    expect(criticalViolations).toEqual([]);
    
    // Log any violations found for debugging (non-blocking)
    if (accessibilityScanResults.violations.length > 0) {
      console.log('Accessibility violations found:');
      accessibilityScanResults.violations.forEach(v => {
        console.log(`  - ${v.id}: ${v.description} (${v.impact})`);
      });
    }
  });

  test('all decorative SVGs have aria-hidden attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get all SVG elements on the page
    const svgs = await page.locator('svg').all();
    
    // All SVGs should have aria-hidden="true" since they're decorative
    for (const svg of svgs) {
      const ariaHidden = await svg.getAttribute('aria-hidden');
      
      // SVGs should either have aria-hidden="true" or be inside an aria-labelledby element
      // For this test, we verify that decorative icons have the correct attributes
      const className = await svg.getAttribute('class');
      
      // Feature icons and button icons should be decorative
      if (className?.includes('w-4 h-4') || className?.includes('w-6 h-6')) {
        expect(ariaHidden).toBe('true');
      }
    }
  });

  test('buttons with icons have accessible labels', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Find all buttons/links that contain SVGs
    const buttonsWithIcons = await page.locator('a:has(svg), button:has(svg)').all();
    
    for (const button of buttonsWithIcons) {
      // Check if button has visible text
      const text = await button.textContent();
      const hasAriaLabel = await button.getAttribute('aria-label');
      
      // Button should either have text content or an aria-label
      const hasAccessibleLabel = (text && text.trim().length > 0) || hasAriaLabel;
      expect(hasAccessibleLabel).toBe(true);
    }
  });
});