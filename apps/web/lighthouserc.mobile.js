/**
 * Lighthouse CI budgets — mobile form factor.
 *
 * Mirrors `lighthouserc.js` but collects under the mobile emulation preset
 * (small viewport, device-scale 2.625) so mobile UX regressions fail CI too.
 * The throttling numbers are pinned identically to the desktop config so the
 * two audits measure the same network/cpu conditions.
 *
 * Issue: #1652 - Lighthouse CI enforcement; mobile form-factor collect preset
 *
 * Run locally against a warmed production build (see lighthouserc.js):
 *
 *   pnpm exec next start -p 3210 &
 *   for r in / /runs /runs/run-1024 /analytics /api/runs; do \
 *     curl -s -o /dev/null "http://127.0.0.1:3210$r"; done
 *   CHROME_PATH=<path-to-chrome> pnpm dlx @lhci/cli@0.15.1 \
 *     autorun --config=lighthouserc.mobile.js
 */

const ROUTES = [
  "http://127.0.0.1:3210/",
  "http://127.0.0.1:3210/runs",
  "http://127.0.0.1:3210/runs/run-1024",
  "http://127.0.0.1:3210/analytics",
];

/** Pinned Slow-4G simulated throttling — identical to the desktop config. */
const THROTTLING = {
  rttMs: 150,
  throughputKbps: 1638.4,
  cpuSlowdownMultiplier: 4,
  requestLatencyMs: 150 * 3.75,
  downloadThroughputKbps: 1638.4,
  uploadThroughputKbps: 675,
};

module.exports = {
  ci: {
    collect: {
      url: ROUTES,
      numberOfRuns: 3,
      settings: {
        // LHCI's settings.preset only accepts perf/experimental/desktop — a
        // mobile preset is expressed via formFactor + screenEmulation below.
        onlyCategories: ["performance", "accessibility"],
        throttlingMethod: "simulate",
        throttling: THROTTLING,
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 915,
          deviceScaleFactor: 2.625,
          disabled: false,
        },
        formFactor: "mobile",
        chromeFlags: "--no-sandbox --disable-dev-shm-usage --disable-gpu",
        maxWaitForLoad: 60000,
      },
    },
    assert: {
      /*
       * Mobile floors, re-ratcheted 2026-09-28 to the current main baseline
       * measured over a local three-run median per route (Chromium 150).
       * Derivation matches lighthouserc.js: perf floors = worst observed
       * median x 0.75 rounded down to 0.05; LCP ceilings = worst observed
       * median x 1.20 rounded up to 100ms; a11y floors = observed baseline
       * - 0.03; CLS keeps the flat 0.1 (worst observed 0.0006).
       *
       * Measured medians (three-run median per route):
       *   /             perf 0.42 · a11y 0.89 · LCP 7.9s
       *   /runs         perf 0.45 · a11y 0.84 · LCP 7.9s
       *   /runs/run-1024 perf 0.43 · a11y 0.87 · LCP 8.2s
       *   /analytics    perf 0.39 · a11y 0.92 · LCP 7.8s
       * Mobile perf is inherently lower than desktop under the same pinned
       * throttling; these floors hold each route to its own measured baseline
       * and are tuned to catch regressions, not drift.
       */
      assertMatrix: [
        {
          // Dashboard. perf 0.30 · a11y 0.86 · LCP 9.5s
          matchingUrlPattern: "^http://127\\.0\\.0\\.1:3210/$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.3 }],
            "categories:accessibility": ["error", { minScore: 0.86 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 9500 }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
            "categories:best-practices": "off",
            "categories:seo": "off",
          },
        },
        {
          // Runs list. perf 0.30 · a11y 0.81 · LCP 9.5s
          matchingUrlPattern: "^http://127\\.0\\.0\\.1:3210/runs$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.3 }],
            "categories:accessibility": ["error", { minScore: 0.81 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 9500 }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
            "categories:best-practices": "off",
            "categories:seo": "off",
          },
        },
        {
          // Run detail — the noisiest route. perf 0.30 · a11y 0.84 · LCP 9.9s
          matchingUrlPattern: "^http://127\\.0\\.0\\.1:3210/runs/run-1024$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.3 }],
            "categories:accessibility": ["error", { minScore: 0.84 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 9900 }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
            "categories:best-practices": "off",
            "categories:seo": "off",
          },
        },
        {
          // Analytics. perf 0.25 · a11y 0.89 · LCP 9.4s
          matchingUrlPattern: "^http://127\\.0\\.0\\.1:3210/analytics$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.25 }],
            "categories:accessibility": ["error", { minScore: 0.89 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 9400 }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
            "categories:best-practices": "off",
            "categories:seo": "off",
          },
        },
      ],
    },
    upload: {
      // Temporary public storage mirrors the desktop run: gives the PR comment
      // permanent report links without running a LHCI server.
      target: "temporary-public-storage",
    },
  },
};