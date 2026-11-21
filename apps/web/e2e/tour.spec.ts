import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * First-run walkthrough e2e coverage.
 *
 * The old guided product tour (`data-testid="product-tour-*"`,
 * `ProductTourHost`) is no longer mounted anywhere in the app — the component
 * still exists but has no callers, so every tour selector in this spec was
 * dead. The live onboarding affordance is the wizard mounted globally by
 * `DeferredAppChrome` (`OnboardingWizardHost`); these specs exercise that UI
 * instead, covering the full step loop, skip/Escape, a11y semantics and
 * durable completion.
 *
 * The shared fixture preseeds the wizard-complete flag on every navigation.
 * `revealWizardOnce` clears it only on the first load (tracked in
 * sessionStorage) so a reload after completion still sees the persisted flag.
 */

const WIZARD_COMPLETE_KEY = 'crashlab:onboarding-wizard-complete:v1';
const WIZARD_COMPLETE_SESSION_KEY = 'crashlab:onboarding-wizard-complete-session:v1';
const WIZARD_PRIMED_KEY = 'crashlab:e2e-onboarding-wizard-primed';

const WIZARD_DIALOG = '[role="dialog"][aria-labelledby="wizard-title"]';

const WIZARD_TITLES = [
  'Welcome to CrashLab',
  'Viewing Runs & Reports',
  'Understanding Crashes & Replays',
  'Templates & Customization',
  'Get Started',
] as const;

const revealWizardOnce = async (page: Page) => {
  await page.addInitScript(
    ([completeKey, sessionKey, primedKey]) => {
      if (sessionStorage.getItem(primedKey) === 'true') return;
      localStorage.removeItem(completeKey);
      sessionStorage.removeItem(sessionKey);
      sessionStorage.setItem(primedKey, 'true');
    },
    [WIZARD_COMPLETE_KEY, WIZARD_COMPLETE_SESSION_KEY, WIZARD_PRIMED_KEY] as const,
  );
};

const fulfillRunsRequest = async (page: Page) => {
  await page.route('**/api/runs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [], total: 0 }),
    });
  });
};

const openWizard = async (page: Page) => {
  await revealWizardOnce(page);
  await page.goto('/dashboard');
  const wizard = page.locator(WIZARD_DIALOG);
  await expect(wizard).toBeVisible({ timeout: 15000 });
  return wizard;
};

const expectCompletionPersisted = async (page: Page) => {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), WIZARD_COMPLETE_KEY))
    .toBe('true');
};

test.describe('Onboarding wizard (replaces the removed guided tour)', () => {
  test.beforeEach(async ({ page }) => {
    await fulfillRunsRequest(page);
  });

  test('walks all five steps, completes the wizard and stays dismissed on reload', async ({
    page,
  }) => {
    const wizard = await openWizard(page);

    for (const [index, title] of WIZARD_TITLES.entries()) {
      await expect(wizard.getByRole('heading', { name: title })).toBeVisible();
      await expect(wizard.getByText(`Step ${index + 1} of 5`)).toBeVisible();
      if (index < WIZARD_TITLES.length - 1) {
        await wizard.getByRole('button', { name: 'Next' }).click();
      }
    }

    await wizard.getByRole('button', { name: 'Get Started' }).click();
    await expect(wizard).toHaveCount(0);
    await expectCompletionPersisted(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(wizard).toHaveCount(0, { timeout: 10000 });
  });

  test('skipping dismisses the wizard durably', async ({ page }) => {
    const wizard = await openWizard(page);

    // Header (X) and footer both expose "Skip wizard"; either persists completion.
    await wizard.getByRole('button', { name: 'Skip wizard' }).first().click();
    await expect(wizard).toHaveCount(0);
    await expectCompletionPersisted(page);
  });

  test('has no Previous control on the first step and can navigate back later', async ({
    page,
  }) => {
    const wizard = await openWizard(page);

    await expect(wizard.getByRole('button', { name: 'Previous' })).toHaveCount(0);
    await wizard.getByRole('button', { name: 'Next' }).click();
    await expect(wizard.getByRole('heading', { name: WIZARD_TITLES[1] })).toBeVisible();
    await expect(wizard.getByRole('button', { name: 'Previous' })).toBeVisible();

    await wizard.getByRole('button', { name: 'Previous' }).click();
    await expect(wizard.getByRole('heading', { name: WIZARD_TITLES[0] })).toBeVisible();
    await expect(wizard.getByRole('button', { name: 'Previous' })).toHaveCount(0);
  });

  test('exposes accessible dialog semantics and closes on Escape', async ({ page }) => {
    const wizard = await openWizard(page);

    await expect(wizard).toHaveAttribute('role', 'dialog');
    await expect(wizard).toHaveAttribute('aria-modal', 'true');
    await expect(wizard).toHaveAttribute('aria-labelledby', 'wizard-title');
    await expect(wizard).toHaveAttribute('aria-describedby', 'wizard-description');

    await page.keyboard.press('Escape');
    await expect(wizard).toHaveCount(0);
    await expectCompletionPersisted(page);
  });

  test('does not appear when onboarding is already complete', async ({ page }) => {
    // No `revealWizardOnce` here: the shared fixture keeps the completion flag
    // set, so a plain dashboard visit must not show the wizard.
    await page.goto('/dashboard');
    await expect(page.locator(WIZARD_DIALOG)).toHaveCount(0, { timeout: 10000 });
  });
});
