#!/usr/bin/env node
/**
 * Per-route performance harness (W5-D09 / #1881).
 *
 * Measures what a user actually pays for each route:
 *   - first-load client JS (gzip + raw), from Next's app build manifests
 *   - route-only JS (chunks no other route loads)
 *   - RSC/Flight payload bytes embedded in the HTML
 *   - TTFB, hydration proxy, LCP and INP when a server/browser is available
 *
 * The offline manifest measurement is deterministic and runs in CI after
 * `next build`. RSC/timing metrics are added when `--base-url` (and optionally
 * `--browser`) is supplied.
 *
 * Usage:
 *   node scripts/perf-harness.mjs                       # measure + write report
 *   node scripts/perf-harness.mjs --check               # fail on regression
 *   node scripts/perf-harness.mjs --update              # ratchet budgets down
 *   node scripts/perf-harness.mjs --base-url http://127.0.0.1:3210 \
 *     --browser --check                                 # full route metrics
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import {
  DEFAULT_TOLERANCES,
  TIMING_METRICS,
  diffBudgets,
  extractRscPayload,
  formatBytes,
  formatMs,
  materializeRoute,
  normalizeRoute,
  ratchetBudgets,
  summarizeSamples,
  validateBudgetFile,
} from './perf-harness-lib.mjs';

const cwd = process.cwd();
const webDir = fs.existsSync(path.join(cwd, 'apps', 'web'))
  ? path.join(cwd, 'apps', 'web')
  : cwd;
const nextDir = path.join(webDir, '.next');
const defaultBudgetPath = path.join(webDir, 'perf-budgets.json');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const argValue = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};

const options = {
  check: hasFlag('--check'),
  update: hasFlag('--update'),
  browser: hasFlag('--browser'),
  requireRuntime: hasFlag('--require-runtime'),
  enforceTiming: hasFlag('--enforce-timing'),
  baseUrl: argValue('--base-url', process.env.PERF_BASE_URL || null),
  budgetPath: path.resolve(webDir, argValue('--budget', defaultBudgetPath)),
  outPath: path.resolve(webDir, argValue('--out', path.join('.next', 'analyze', 'perf-report.json'))),
  samples: Number(argValue('--samples', '3')) || 3,
  routeFilter: argValue('--routes', null),
  allowIncrease: hasFlag('--allow-increase'),
  reason: argValue('--reason', null),
  fixtureRunId: argValue('--fixture-run', 'run-1024'),
};

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getGitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const sizeCache = new Map();
function getFileSizes(filePath) {
  if (sizeCache.has(filePath)) return sizeCache.get(filePath);
  try {
    if (!fs.existsSync(filePath)) {
      const zero = { raw: 0, gzip: 0 };
      sizeCache.set(filePath, zero);
      return zero;
    }
    const buffer = fs.readFileSync(filePath);
    const sizes = { raw: buffer.length, gzip: zlib.gzipSync(buffer).length };
    sizeCache.set(filePath, sizes);
    return sizes;
  } catch {
    const zero = { raw: 0, gzip: 0 };
    sizeCache.set(filePath, zero);
    return zero;
  }
}

function walkFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, fileList);
    else fileList.push(fullPath);
  }
  return fileList;
}

function chunkPath(chunk) {
  const normalized = String(chunk).replace(/^\/_next\//, '');
  return path.join(nextDir, normalized);
}

function loadRscManifest(filePath) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n;globalThis.__RSC_MANIFEST;`, {});
  } catch {
    return null;
  }
}

/**
 * Preferred source: app-build-manifest.json (what Next actually loads).
 * Fallback: per-page client reference manifests, which survive partial builds
 * and expose the same eager entry chunks.
 */
function collectRouteChunks() {
  const appManifest = readJson(path.join(nextDir, 'app-build-manifest.json'));
  const buildManifest = readJson(path.join(nextDir, 'build-manifest.json'), { rootMainFiles: [] });
  const rootMainFiles = new Set(buildManifest?.rootMainFiles ?? []);
  const routeChunks = new Map();

  if (appManifest?.pages && Object.keys(appManifest.pages).length > 0) {
    for (const [rawRoute, chunks] of Object.entries(appManifest.pages)) {
      if (rawRoute === '/layout' || rawRoute.endsWith('/layout')) continue;
      const route = normalizeRoute(rawRoute);
      const set = new Set(chunks ?? []);
      for (const rootFile of rootMainFiles) set.add(rootFile);
      routeChunks.set(route, set);
    }
    return { routeChunks, rootMainFiles, source: 'app-build-manifest' };
  }

  const manifestFiles = walkFiles(path.join(nextDir, 'server', 'app')).filter((file) =>
    file.endsWith('page_client-reference-manifest.js'),
  );
  for (const manifestFile of manifestFiles) {
    const manifest = loadRscManifest(manifestFile);
    if (!manifest) continue;
    for (const [key, entry] of Object.entries(manifest)) {
      if (!key.endsWith('/page')) continue;
      const route = normalizeRoute(key);
      const chunks = new Set();
      // app-build-manifest lists the eager chunks for the route's layouts and
      // page. Error boundaries are separate entries and are not part of a
      // normal navigation, so exclude them from the fallback measurement.
      for (const [entryKey, files] of Object.entries(entry?.entryJSFiles ?? {})) {
        if (!entryKey.endsWith('/layout') && !entryKey.endsWith('/page')) continue;
        for (const chunk of files ?? []) chunks.add(chunk);
      }
      const pageBuildManifest = readJson(path.join(path.dirname(manifestFile), 'build-manifest.json'));
      for (const rootFile of pageBuildManifest?.rootMainFiles ?? []) chunks.add(rootFile);
      for (const rootFile of rootMainFiles) chunks.add(rootFile);
      routeChunks.set(route, chunks);
    }
  }
  return { routeChunks, rootMainFiles, source: routeChunks.size > 0 ? 'client-reference-manifest' : 'none' };
}

function measureRouteChunks(routeChunks, rootMainFiles, allRouteChunks) {
  const usage = new Map();
  for (const chunks of allRouteChunks.values()) {
    for (const chunk of chunks) usage.set(chunk, (usage.get(chunk) ?? 0) + 1);
  }

  const routes = {};
  for (const [route, chunks] of routeChunks) {
    let firstLoadJsGzip = 0;
    let firstLoadJsRaw = 0;
    let routeOnlyJsGzip = 0;
    let routeOnlyJsRaw = 0;
    for (const chunk of chunks) {
      const sizes = getFileSizes(chunkPath(chunk));
      firstLoadJsGzip += sizes.gzip;
      firstLoadJsRaw += sizes.raw;
      if (usage.get(chunk) === 1 && !rootMainFiles.has(chunk)) {
        routeOnlyJsGzip += sizes.gzip;
        routeOnlyJsRaw += sizes.raw;
      }
    }
    routes[route] = {
      firstLoadJsGzip,
      firstLoadJsRaw,
      routeOnlyJsGzip,
      routeOnlyJsRaw,
      chunkCount: chunks.size,
    };
  }
  return routes;
}

async function measureServerRoute(baseUrl, route, samples) {
  const pathname = materializeRoute(route, options.fixtureRunId);
  if (pathname.includes('[')) return null;
  const url = new URL(pathname, baseUrl).toString();
  const rscSamples = [];
  const htmlSamples = [];
  const ttfbSamples = [];

  for (let i = 0; i < samples + 1; i += 1) {
    const started = performance.now();
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': 'crashlab-perf-harness' },
      redirect: 'follow',
    });
    const body = await response.text();
    const elapsed = performance.now() - started;
    if (i === 0) continue; // warm-up sample, excluded from the p95
    htmlSamples.push(Buffer.byteLength(body, 'utf8'));
    rscSamples.push(extractRscPayload(body).bytes);
    ttfbSamples.push(elapsed);
  }

  return {
    rscPayloadBytes: summarizeSamples(rscSamples)?.p95 ?? null,
    htmlBytes: summarizeSamples(htmlSamples)?.p95 ?? null,
    ttfbMs: summarizeSamples(ttfbSamples)?.p95 ?? null,
  };
}

async function measureBrowserRoute(baseUrl, route, samples) {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    return null;
  }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__perfLcp = 0;
    window.__perfInp = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // Older browsers: LCP stays 0 and is reported as an empty metric.
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__perfInp = Math.max(window.__perfInp, entry.duration);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {
      // Event Timing is unavailable in some engines; INP is omitted.
    }
  });

  const pathname = materializeRoute(route, options.fixtureRunId);
  if (pathname.includes('[')) {
    await browser.close();
    return null;
  }
  const url = new URL(pathname, baseUrl).toString();
  const hydrationSamples = [];
  const lcpSamples = [];
  const inpSamples = [];

  try {
    for (let i = 0; i < samples + 1; i += 1) {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      const hydrationMs = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const nav = performance.getEntriesByType('navigation')[0];
        const start = nav?.domContentLoadedEventEnd ?? nav?.responseEnd ?? 0;
        return performance.now() - start;
      });
      // A trusted interaction is required for the Event Timing API to report
      // INP candidates; synthetic MouseEvents are ignored.
      await page.click('main', { position: { x: 5, y: 5 }, timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(150);
      const sample = await page.evaluate((hydrationMs) => {
        return {
          hydrationMs,
          lcpMs: window.__perfLcp ?? 0,
          inpMs: window.__perfInp ?? 0,
        };
      }, hydrationMs);
      if (i === 0) continue;
      hydrationSamples.push(sample.hydrationMs);
      lcpSamples.push(sample.lcpMs);
      inpSamples.push(sample.inpMs);
    }
  } finally {
    await browser.close();
  }

  return {
    hydrationMs: summarizeSamples(hydrationSamples)?.p95 ?? null,
    lcpMs: summarizeSamples(lcpSamples)?.p95 ?? null,
    inpMs: summarizeSamples(inpSamples)?.p95 ?? null,
  };
}

function routeMatchesFilter(route) {
  if (!options.routeFilter) return true;
  return options.routeFilter.split(',').map((value) => normalizeRoute(value.trim())).includes(route);
}

function writeMarkdown(report, diff) {
  const lines = ['## Per-route performance (W5-D09)', ''];
  lines.push(`Source: \`${report.source}\` · routes: ${Object.keys(report.routes).length} · fixture: \`${report.fixtureRunId}\``);
  lines.push('');
  lines.push('| Route | First-load JS (gzip) | Route-only JS | RSC payload | Hydration | LCP | INP |');
  lines.push('| :--- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [route, metrics] of Object.entries(report.routes)) {
    lines.push(
      `| \`${route}\` | ${formatBytes(metrics.firstLoadJsGzip)} | ${formatBytes(metrics.routeOnlyJsGzip)} | ${formatBytes(metrics.rscPayloadBytes)} | ${formatMs(metrics.hydrationMs)} | ${formatMs(metrics.lcpMs)} | ${formatMs(metrics.inpMs)} |`,
    );
  }
  if (diff) {
    lines.push('');
    if (diff.ok) lines.push('> ✅ All per-route budgets met (ratchet holds).');
    else lines.push(`> ❌ ${diff.regressions.length} budget regression(s) detected.`);
    for (const regression of diff.regressions) {
      lines.push(
        `- \`${regression.route}\` ${regression.metric}: ${regression.measured} > ${regression.budget} (+${regression.deltaPct.toFixed(1)}%, tolerance ${regression.tolerancePct}%)`,
      );
    }
    for (const regression of diff.advisory ?? []) {
      lines.push(
        `- advisory \`${regression.route}\` ${regression.metric}: ${regression.measured} > ${regression.budget} (+${regression.deltaPct.toFixed(1)}%) — Lighthouse LCP remains the hard gate`,
      );
    }
    for (const route of diff.missingRoutes) lines.push(`- missing budget/measurement for \`${route}\``);
    for (const missing of diff.missingMetrics) lines.push(`- missing runtime metric \`${missing.metric}\` for \`${missing.route}\``);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  if (!fs.existsSync(nextDir)) {
    console.error('No .next build output found. Run `pnpm --dir apps/web run build` first.');
    process.exit(2);
  }

  const { routeChunks, rootMainFiles, source } = collectRouteChunks();
  if (routeChunks.size === 0) {
    console.error('No routes found in .next manifests. Re-run the build.');
    process.exit(2);
  }

  const filtered = new Map(
    Array.from(routeChunks.entries()).filter(([route]) => routeMatchesFilter(route)),
  );
  const routes = measureRouteChunks(filtered, rootMainFiles, routeChunks);

  if (options.baseUrl) {
    for (const route of Object.keys(routes)) {
      try {
        const serverMetrics = await measureServerRoute(options.baseUrl, route, options.samples);
        if (serverMetrics) Object.assign(routes[route], serverMetrics);
        if (options.browser) {
          const browserMetrics = await measureBrowserRoute(options.baseUrl, route, Math.min(options.samples, 3));
          if (browserMetrics) Object.assign(routes[route], browserMetrics);
        }
      } catch (error) {
        console.warn(`[perf] ${route}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    commitSha: getGitSha(),
    source,
    baseUrl: options.baseUrl ?? null,
    fixtureRunId: options.fixtureRunId,
    samples: options.samples,
    routes,
  };

  // A zero timing value means "not observed", not "instant". Dropping it keeps
  // the ratchet from recording an impossible 0 ms budget.
  for (const metrics of Object.values(report.routes)) {
    for (const metric of TIMING_METRICS) {
      if (metrics[metric] === 0) delete metrics[metric];
    }
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, JSON.stringify(report, null, 2));

  const baseline = readJson(options.budgetPath, null);
  let diff = null;

  if (options.check || options.update) {
    if (!baseline) {
      console.error(`Missing budget file: ${options.budgetPath}. Run with --update to bootstrap it.`);
      process.exit(2);
    }
    const validationErrors = validateBudgetFile(baseline);
    if (validationErrors.length > 0) {
      console.error(`Invalid budget file:\n- ${validationErrors.join('\n- ')}`);
      process.exit(2);
    }
  }

  if (options.update) {
    const result = ratchetBudgets(baseline.routes, routes, {
      allowIncrease: options.allowIncrease,
      requireRuntime: options.requireRuntime,
      reason: options.reason,
    });
    if (result.blocked.length > 0) {
      console.error('Budget increases require review (re-run with --allow-increase --reason "<why>"):');
      for (const blocked of result.blocked) {
        console.error(`  ${blocked.route} ${blocked.metric}: ${blocked.previous} -> ${blocked.measured}`);
      }
      process.exit(1);
    }
    const next = {
      ...baseline,
      version: 1,
      generatedAt: report.generatedAt,
      commitSha: report.commitSha,
      source: report.source,
      fixture: {
        runId: options.fixtureRunId,
        samples: options.samples,
        dynamicRoute: '/runs/[id] -> /runs/run-1024',
      },
      tolerances: baseline.tolerances ?? DEFAULT_TOLERANCES,
      routes: result.routes,
    };
    fs.writeFileSync(options.budgetPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`[perf] updated ${path.relative(webDir, options.budgetPath)} (${result.changes.length} change(s))`);
  }

  if (options.check) {
    diff = diffBudgets(baseline.routes, routes, {
      requireRuntime: options.requireRuntime,
      requireAllRoutes: !options.routeFilter,
      enforceTiming: options.enforceTiming,
      fixtureRunId: options.fixtureRunId,
    });
  }

  const markdown = writeMarkdown(report, diff);
  fs.writeFileSync(path.join(path.dirname(options.outPath), 'perf-report.md'), markdown);
  console.log(markdown);

  if (diff && !diff.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
