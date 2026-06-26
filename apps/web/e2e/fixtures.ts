import { test as base, expect } from '@playwright/test';

const ONBOARDING_WIZARD_COMPLETE_KEY = 'crashlab:onboarding-wizard-complete:v1';

/**
 * Dismiss the first-visit onboarding wizard so it does not intercept clicks in e2e tests.
 */
export const test = base.extend({
  page: async ({ page }, runWithPage) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'true');
    }, ONBOARDING_WIZARD_COMPLETE_KEY);
    await runWithPage(page);
  },
});

export { expect };
