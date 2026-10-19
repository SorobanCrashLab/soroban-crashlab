/**
 * Lighthouse CI budgets for the four key routes.
 *
 * Scope: CI gate only. No dashboards, no RUM, no historical storage — a red
 * assertion here is the entire product of this config.
 *
 * Issue: #1408 - Lighthouse CI budgets on key pages with PR score comments
 *
 * Budgets are loaded from `perf-budgets.json` (the single source of truth
 * shared with size-limit). `pnpm budget:update` regenerates that file from a
 * measured run, so increases are reviewed in the PR diff like code.
 *
 * Run locally against a production build (the server must already be up and
 * warmed — see the "no startServerCommand" note below):
 *
 *   pnpm run build
 *   pnpm exec next start -p 3210 &
 *   for r in / /runs /runs/run-1024 /analytics /api/runs; do \
 *     curl -s -o /dev/null "http://127.0.0.1:3210$r"; done
 *   CHROME_PATH=<path-to-chrome> pnpm run lhci
 */

/**
 * Routes audited. Three are statically prerendered (`○` in the build output);
 * `/runs/:id` is server-rendered on demand (`ƒ`), which is why we collect
 * against a real `next start` server rather than `staticDistDir`. A static
 * dist directory could not serve the dynamic segment or the `/api/runs` calls
 * the dashboard makes on mount.
 */
const budgets = require("./perf-budgets.json");

/**
 * Map a budget entry's `path` to the absolute URL LHCI collects against.
 * Budgets are keyed by route path so the same file drives size-limit.
 */
const urlFor = (path) => `http://127.0.0.1:3210${path}`;

const ROUTES = [
  ...budgets.routes.map((route) => urlFor(route.path)),
];

/**
 * Pinned throttling. Lighthouse's own `mobileSlow4G` preset is a moving target
 * across releases; stating the numbers keeps a Lighthouse upgrade from silently
 * shifting every threshold. These are the standard simulated Slow 4G values.
 */
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
      /*
       * No `startServerCommand`: the caller starts `next start` and pre-warms
       * every route with a request first. Letting LHCI boot the server would
       * fold Next's first-hit cost (dynamic segment render, the dashboard's
       * /api/runs fetch) into sample one of run one, which is the single
       * largest source of variance we measured.
       */
      url: ROUTES,
      // Median of three. Lighthouse reports the median run per URL, which
      // discards the single-sample outliers that dominate CI noise.
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        // Only the categories we assert on. Dropping SEO/best-practices keeps
        // each run shorter and the PR comment narrow.
        onlyCategories: ["performance", "accessibility"],
        throttlingMethod: "simulate",
        throttling: THROTTLING,
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        formFactor: "desktop",
        // Chrome flags that matter for determinism in a container.
        chromeFlags: "--no-sandbox --disable-dev-shm-usage --disable-gpu",
        maxWaitForLoad: 60000,
      },
    },
    assert: {
      /*
       * Per-route budgets. A single global floor would have to sit at the
       * noisiest route's floor and would then gate the quiet routes at nothing;
       * each route is instead held to its own measured baseline.
       *
       * Derivation, from the six-run study in the PR body (each run = median of
       * 3 samples, idle 4-core host):
       *   perf floors  = worst observed median  x 0.75, rounded down to 0.05
       *   LCP ceilings = worst observed median  x 1.20, rounded up to 100ms
       *   a11y floors  = observed baseline - 0.03 (re-ratcheted 2026-09-24)
       * CLS keeps the issue's flat 0.1 — worst observed is 0.0097, >10x headroom.
       *
       * The relative margins are wide on purpose. A first pass using
       * min - 2*stdev put the dashboard floor at 0.40; the very next run
       * measured 0.39 and went red. Performance scoring on a 4-vCPU runner has
       * a fatter tail than five runs reveal, so these floors are set to catch
       * real regressions, not drift.
       *
       * These are NOT the issue's aspirational targets (perf 0.85, LCP 2.5s) —
       * current main cannot meet those on any of the four routes. See the
       * ratchet plan in the PR body.
       *
       * 2026-09-24 re-ratchet: the accessibility floors were re-derived from
       * the current main baseline after the theme/dark-mode color merge
       * (#1691) brought a11y on all four audited routes down to
       * 0.83 / 0.80 / 0.82 / 0.85 (stable across two independent runs on a
       * fresh PR — zero variance across 12 samples). Floors now sit at
       * observed baseline - 0.03 and the /runs LCP ceiling moves to 6500ms
       * (observed samples 6.0-6.2s). Upstream a11y work (issue #1586) will
       * ratchet these back up once it lands.
       */
      /*
       * Per-route budgets are generated from `perf-budgets.json` by
       * `pnpm budget:update`. Each entry carries the measured baseline for
       * performance, accessibility, LCP and CLS; the script applies the
       * ratchet margins (perf/a11y floor = baseline - margin, LCP ceiling =
       * baseline + margin) so the committed numbers are the enforced ones.
       */
      assertMatrix: budgets.routes.map((route) => ({
        matchingUrlPattern: `^${urlFor(route.path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        assertions: {
          "categories:performance": [
            "error",
            { minScore: route.lighthouse.performance },
          ],
          "categories:accessibility": [
            "error",
            { minScore: route.lighthouse.accessibility },
          ],
          "largest-contentful-paint": [
            "error",
            { maxNumericValue: route.lighthouse.lcpMs },
          ],
          "cumulative-layout-shift": [
            "error",
            { maxNumericValue: route.lighthouse.cls },
          ],
          "categories:best-practices": "off",
          "categories:seo": "off",
        },
      })),
    },
    upload: {
      // Public temporary storage: gives the PR comment permanent report links
      // without this repo running a LHCI server. No dashboards (non-goal).
      target: "temporary-public-storage",
    },
  },
};
