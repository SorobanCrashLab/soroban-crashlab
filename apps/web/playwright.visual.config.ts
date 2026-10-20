import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the visual regression gate.
 *
 * It deliberately mirrors `playwright.config.ts` (same base URL, same port,
 * same snapshot directory and thresholds) but discovers *only* the visual
 * specs so the gate can run on its own in a pinned container: rendering must
 * be reproducible, and the functional e2e job must not pay for screenshots.
 *
 * The main config ignores these specs (`testIgnore`), so the two jobs never
 * double-run the same test.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['visual.spec.ts', 'visual/**/*.spec.ts'],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* No retries: a screenshot that only matches on the second attempt is a
   * flake we want to see, not paper over. */
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,
  /* Baselines are shared with `visual.spec.ts`; see the comment there and in
   * apps/web/e2e/visual/README.md about globally-unique screenshot names. */
  snapshotDir: 'e2e/visual.spec.ts-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{arg}-{projectName}{ext}',
  expect: {
    timeout: 5000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    },
  },
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report-visual' }],
    ['json', { outputFile: 'test-results-visual/results.json' }],
    ['junit', { outputFile: 'test-results-visual/junit.xml' }],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  use: {
    baseURL: 'http://localhost:3077',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'pnpm exec next start -p 3077'
      : 'pnpm exec next dev -p 3077',
    url: 'http://localhost:3077',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: 'http://localhost:3077',
    },
  },
});
