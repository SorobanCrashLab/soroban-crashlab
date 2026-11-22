import { test as base, expect } from '@playwright/test';

const ONBOARDING_WIZARD_COMPLETE_KEY = 'crashlab:onboarding-wizard-complete:v1';
const TOUR_DISMISSED_KEY = 'crashlab:product-tour-dismissed:v1';

/**
 * Dismiss the first-visit onboarding wizard and the guided product tour so they
 * do not intercept clicks in existing e2e specs. Specs that intentionally
 * exercise the wizard/tour override these keys via their own init scripts.
 */
export const test = base.extend({
  page: async ({ page }, runWithPage) => {
    await page.addInitScript(([wizardKey, tourKey]) => {
      localStorage.setItem(wizardKey, 'true');
      localStorage.setItem(tourKey, 'true');
    }, [ONBOARDING_WIZARD_COMPLETE_KEY, TOUR_DISMISSED_KEY] as const);
    await runWithPage(page);
  },
});

export { expect };
