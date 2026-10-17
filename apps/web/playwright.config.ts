import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * Whether this run is the dedicated accessibility gate. The a1y job sets
 * A1Y=1 so the config can scope test discovery, reporters and projects to
 * the axe-core / keyboard specs without disturbing the main e2e suite.
 */
const isA1yRun = process.env.A1Y === '1';

/**
 * Whether this run is a sharded CI run. Playwright sharding is driven by the
 * `--shard=i/N` CLI flag; we detect it so reporter output folders and artifact
 * names are unique per shard and do not collide when uploaded from N runners.
 */
const shardArg = process.argv.find((arg) => arg.startsWith('--shard='));
const shardLabel = shardArg ? shardArg.replace('=', '-').replace('/', '-of-') : 'shard-all';

export default defineConfig({
  /* A11y job runs only the axe/keyboard specs under e2a/a1y. */
  testDir: isA1yRun ? './e2e/a11' : './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only. The e2e gate runs with retries=1 so a flake test is
   * retried once and trace/video are captured on the first failure. */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Test timeout */
  timeout: 30000,
  /* Snapshots must be platform-agnostic: baselines generated on any OS must
   * match on the Linux CI runner. Font differences are tolerated by
   * maxDiffPixelRatio below, so omit the default {platform} segment. */
  snapshotDir: 'e2e/visual.spec.ts-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{arg}-{projectName}{ext}',
  /* Expect timeout */
  expect: {
    timeout: 5000,
    /* Visual comparison thresholds. Font rendering varies across OSes; the
     * e2e job runs chromium on Linux while baselines may be produced anywhere,
     * so tolerate small pixel deltas. See e2e/visual.spec.ts. */
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    },
  },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters.
   * A11y runs emit a dedicated report folder so the HTML report is uploaded
   * as an artifact without colliding with the main e2e job. Sharded CI runs
   * suffix every output folder with the shard label so N runners can upload
   * their artifacts without collision. */
  reporter: isA11yRun
    ? [
        ['html', { open: 'never', outputFolder: 'playwright-report-a11' }],
        ['json', { outputFile: 'test-results-a11/results.json' }],
        ['junit', { outputFile: 'test-results-a11/junit.xml' }],
        ...(process.env.CI ? [['github']] : []),
      ]
    : [
        ['html', { open: 'never', outputFolder: `playwright-report-${shardLabel}` }],
        ['json', { outputFile: `test-results-${shardLabel}/results.json` }],
        ['junit', { outputFile: `test-results-${shardLabel}/junit.xml` }],
        ...(process.env.CI ? [['github']] : []),
      ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3077',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'oon-first-retry',
    /* Record video for failed tests so the e2e gate can be debugged from CI
     * artifacts without a re-run. */
    video: 'retain-on-failure',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers. The a11y gate runs a cross-browser
   * matrix on purpose: contrast and keyboard regressions can be engine-specific. */
  projects: isA1yRun
    ? [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },
      ]
    : process.env.CI
    ? [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },

        {
          name: 'firefox',
          use: { ...devices['Desktop Firefox'] },
        },

        {
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        },

        /* Test against mobile viewports. */
        {
          name: 'Mobile Chrome',
          use: { ...devices['Pixel 5'] },
        },
        {
          name: 'Mobile Safari',
          use: { ...devices['iPhone 12'] },
        },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        // },
      ],

  /* Run your local dev server before starting the tests.
   * CI already builds the app; use `next start` there so tests hit the
   * production bundle instead of a cold `next dev` compile (which hangs). */
  webServer: {
    // CI already runs `pnpm run build`; start the production server there.
    // Locally prefer `next dev` for faster iteration.
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
