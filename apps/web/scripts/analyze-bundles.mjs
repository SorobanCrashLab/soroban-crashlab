/**
 * Per-route bundle analyzer and reporter for Soroban CrashLab.
 *
 * Reads Next.js build manifests (.next/app-build-manifest.json, .next/build-manifest.json),
 * measures first-load JS and route-specific sizes (both gzip and uncompressed raw bytes),
 * checks measured route groups against .size-limit.json budgets, and produces:
 *
 * 1. .next/analyze/route-sizes.json - Machine-readable JSON for trend tracking across builds.
 * 2. .next/analyze/bundle-report.md  - Markdown summary table for PR comments and $GITHUB_STEP_SUMMARY.
 *
 * Can be run from repository root or apps/web:
 *   node apps/web/scripts/analyze-bundles.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';

// Resolve base paths (support running from repo root or apps/web)
const cwd = process.cwd();
const webDir = fs.existsSync(path.join(cwd, 'apps', 'web'))
  ? path.join(cwd, 'apps', 'web')
  : cwd;
const nextDir = path.join(webDir, '.next');
const analyzeDir = path.join(nextDir, 'analyze');
const sizeLimitConfigPath = path.join(webDir, '.size-limit.json');

/** Safe JSON reader */
function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Get git commit SHA */
function getGitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** Format byte count to human-readable string */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (typeof bytes !== 'number' || isNaN(bytes)) return '—';
  const k = 1024;
  const sizes = ['B', 'kB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/** Parse human size strings like '50 kB', '1.5 MB' into byte integers */
function parseLimit(limitStr) {
  if (!limitStr) return Infinity;
  const match = limitStr.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
  if (!match) return Infinity;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'B').toLowerCase();
  if (unit === 'b') return val;
  if (unit === 'kb' || unit === 'k') return Math.round(val * 1024);
  if (unit === 'mb' || unit === 'm') return Math.round(val * 1024 * 1024);
  if (unit === 'gb' || unit === 'g') return Math.round(val * 1024 * 1024 * 1024);
  return Math.round(val);
}

/** Cache file sizes so shared chunks are only read and gzipped once */
const sizeCache = new Map();
function getFileSizes(filePath) {
  if (sizeCache.has(filePath)) {
    return sizeCache.get(filePath);
  }
  try {
    if (!fs.existsSync(filePath)) {
      const zero = { raw: 0, gzip: 0 };
      sizeCache.set(filePath, zero);
      return zero;
    }
    const buf = fs.readFileSync(filePath);
    const raw = buf.length;
    const gzip = zlib.gzipSync(buf).length;
    const result = { raw, gzip };
    sizeCache.set(filePath, result);
    return result;
  } catch {
    const zero = { raw: 0, gzip: 0 };
    sizeCache.set(filePath, zero);
    return zero;
  }
}

/** Recursively collect all files in a directory */
function getAllFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        getAllFiles(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }
  return fileList;
}

/** Normalize Next.js route path */
function normalizeRoute(rawRoute) {
  if (!rawRoute) return '/';
  if (rawRoute === '/page') return '/';
  if (rawRoute.endsWith('/page')) return rawRoute.slice(0, -5);
  return rawRoute;
}

// Ensure analyze output directory exists
fs.mkdirSync(analyzeDir, { recursive: true });

// Check if Next.js build output exists
if (!fs.existsSync(nextDir)) {
  const fallbackMd = [
    '## 📦 Bundle Size & Route Analysis',
    '',
    '> ⚠️ No Next.js build output found in `.next/`. Run `pnpm run build` first.',
  ].join('\n');
  fs.writeFileSync(path.join(analyzeDir, 'bundle-report.md'), fallbackMd);
  console.log(fallbackMd);
  process.exit(0);
}

// Read build manifests
const appManifest = readJson(path.join(nextDir, 'app-build-manifest.json'), { pages: {} });
const pagesManifest = readJson(path.join(nextDir, 'build-manifest.json'), { pages: {}, rootMainFiles: [] });

const rootMainFiles = new Set(pagesManifest.rootMainFiles || []);

// Map route -> Set of unique chunk relative paths
const routeChunksMap = new Map();
const chunkUsageCount = new Map();

// Helper to record chunk usage
function recordChunkUsage(chunkPath) {
  chunkUsageCount.set(chunkPath, (chunkUsageCount.get(chunkPath) || 0) + 1);
}

// 1. Process App Router routes
if (appManifest.pages && typeof appManifest.pages === 'object') {
  for (const [rawRoute, chunks] of Object.entries(appManifest.pages)) {
    // Skip layout chunks or non-page entries
    if (rawRoute.endsWith('/layout') || rawRoute === '/layout') continue;

    const route = normalizeRoute(rawRoute);
    const chunkSet = new Set(chunks || []);

    // Also include root main files (Next.js bootstrap code)
    for (const rootFile of rootMainFiles) {
      chunkSet.add(rootFile);
    }

    routeChunksMap.set(route, chunkSet);

    // Track chunk frequencies
    for (const chunk of chunkSet) {
      recordChunkUsage(chunk);
    }
  }
}

// 2. Process Pages Router routes (if any exist beyond internal _app, _error)
if (pagesManifest.pages && typeof pagesManifest.pages === 'object') {
  for (const [rawRoute, chunks] of Object.entries(pagesManifest.pages)) {
    if (rawRoute.startsWith('/_')) continue; // Skip Next internal pages
    if (routeChunksMap.has(rawRoute)) continue; // App router takes precedence

    const chunkSet = new Set(chunks || []);
    for (const rootFile of rootMainFiles) {
      chunkSet.add(rootFile);
    }
    routeChunksMap.set(rawRoute, chunkSet);
    for (const chunk of chunkSet) {
      recordChunkUsage(chunk);
    }
  }
}

// 3. Compute per-route First Load JS and Route-specific JS
const routesData = [];
for (const [route, chunkSet] of routeChunksMap.entries()) {
  let firstLoadRaw = 0;
  let firstLoadGzip = 0;
  let routeRaw = 0;
  let routeGzip = 0;

  for (const chunk of chunkSet) {
    // Chunks in manifests are relative to .next/ (e.g. 'static/chunks/app/page.js')
    const fullChunkPath = path.join(nextDir, chunk);
    const sizes = getFileSizes(fullChunkPath);

    firstLoadRaw += sizes.raw;
    firstLoadGzip += sizes.gzip;

    // A chunk is route-specific if it is only used by this route and is not a root main file
    if (chunkUsageCount.get(chunk) === 1 && !rootMainFiles.has(chunk)) {
      routeRaw += sizes.raw;
      routeGzip += sizes.gzip;
    }
  }

  routesData.push({
    route,
    firstLoadGzip,
    firstLoadGzipFormatted: formatBytes(firstLoadGzip),
    firstLoadRaw,
    firstLoadRawFormatted: formatBytes(firstLoadRaw),
    routeGzip,
    routeGzipFormatted: formatBytes(routeGzip),
    routeRaw,
    routeRawFormatted: formatBytes(routeRaw),
    chunkCount: chunkSet.size,
  });
}

// Sort routes alphabetically by default
routesData.sort((a, b) => a.route.localeCompare(b.route));

// 4. Measure Size-Limit Budgets from .size-limit.json
const budgetsData = [];
let allBudgetsPassed = true;
const sizeLimitConfig = readJson(sizeLimitConfigPath, []);

if (Array.isArray(sizeLimitConfig) && sizeLimitConfig.length > 0) {
  const allStaticFiles = getAllFiles(path.join(nextDir, 'static'));

  for (const entry of sizeLimitConfig) {
    const groupName = entry.name || 'Budget';
    const limitStr = entry.limit || '';
    const limitBytes = parseLimit(limitStr);
    const isGzip = entry.gzip !== false;

    let matchedFiles = [];
    const patterns = Array.isArray(entry.path) ? entry.path : [entry.path].filter(Boolean);

    for (const pattern of patterns) {
      // Normalise pattern (e.g. '.next/static/chunks/*.js' -> 'static/chunks/.*\\.js$')
      const cleanPattern = pattern
        .replace(/^\.?\/?\.next\//, '')
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${cleanPattern}$`);

      for (const file of allStaticFiles) {
        const relToNext = path.relative(nextDir, file).replace(/\\/g, '/');
        if (regex.test(relToNext)) {
          matchedFiles.push(file);
        }
      }
    }

    // Deduplicate matched files
    matchedFiles = Array.from(new Set(matchedFiles));

    let measuredBytes = 0;
    for (const file of matchedFiles) {
      const s = getFileSizes(file);
      measuredBytes += isGzip ? s.gzip : s.raw;
    }

    const passed = measuredBytes <= limitBytes;
    if (!passed) {
      allBudgetsPassed = false;
    }

    const delta = measuredBytes - limitBytes;
    let deltaFormatted = '';
    if (delta > 0) {
      deltaFormatted = `+${formatBytes(delta)} over budget`;
    } else {
      deltaFormatted = `-${formatBytes(Math.abs(delta))} under budget`;
    }

    budgetsData.push({
      name: groupName,
      limit: limitStr,
      limitBytes,
      measuredBytes,
      measuredFormatted: formatBytes(measuredBytes),
      passed,
      delta,
      deltaFormatted,
      matchedFilesCount: matchedFiles.length,
    });
  }
}

// 5. Total JS files & Largest Chunks
const allChunks = getAllFiles(path.join(nextDir, 'static', 'chunks'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const s = getFileSizes(f);
    return {
      file: path.basename(f),
      relPath: path.relative(nextDir, f).replace(/\\/g, '/'),
      raw: s.raw,
      gzip: s.gzip,
      rawFormatted: formatBytes(s.raw),
      gzipFormatted: formatBytes(s.gzip),
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const top5Chunks = allChunks.slice(0, 5);

let totalJsRaw = 0;
let totalJsGzip = 0;
for (const chunk of allChunks) {
  totalJsRaw += chunk.raw;
  totalJsGzip += chunk.gzip;
}

// 6. Check for HTML treemap artifacts
const clientTreemapPath = path.join(analyzeDir, 'client.html');
const nodejsTreemapPath = path.join(analyzeDir, 'nodejs.html');
const hasClientTreemap = fs.existsSync(clientTreemapPath);
const hasNodejsTreemap = fs.existsSync(nodejsTreemapPath);

// 7. Write JSON for trend tracking across builds
const trendReport = {
  timestamp: new Date().toISOString(),
  commitSha: getGitSha(),
  allBudgetsPassed,
  totalStaticJs: {
    raw: totalJsRaw,
    gzip: totalJsGzip,
    rawFormatted: formatBytes(totalJsRaw),
    gzipFormatted: formatBytes(totalJsGzip),
  },
  budgets: budgetsData,
  routes: routesData,
  largestChunks: top5Chunks,
  artifacts: {
    clientTreemap: hasClientTreemap,
    nodejsTreemap: hasNodejsTreemap,
  },
};

const routeSizesJsonPath = path.join(analyzeDir, 'route-sizes.json');
fs.writeFileSync(routeSizesJsonPath, JSON.stringify(trendReport, null, 2));

// 8. Generate Markdown report
const mdLines = [];
mdLines.push('## 📦 Bundle Size & Route Analysis');
mdLines.push('');

// Overall status alert
if (budgetsData.length > 0) {
  if (allBudgetsPassed) {
    mdLines.push(`> ✅ **Size Limit Check**: All ${budgetsData.length} route group budgets passed.`);
  } else {
    const failedBudgets = budgetsData.filter((b) => !b.passed);
    mdLines.push(`> ❌ **Size Limit Alert**: ${failedBudgets.length} bundle budget(s) exceeded!`);
  }
  mdLines.push('');
}

// Budgets Table
if (budgetsData.length > 0) {
  mdLines.push('### 🎯 Route Group Budgets');
  mdLines.push('');
  mdLines.push('| Route Group | Budget (gzip) | Measured (gzip) | Status | Headroom / Delta |');
  mdLines.push('| :--- | :--- | :--- | :---: | :--- |');

  for (const b of budgetsData) {
    const statusIcon = b.passed ? '🟢 PASS' : '🔴 FAIL';
    mdLines.push(`| \`${b.name}\` | ${b.limit} | ${b.measuredFormatted} | ${statusIcon} | ${b.deltaFormatted} |`);
  }
  mdLines.push('');
}

// Per-Route First Load JS Table
if (routesData.length > 0) {
  mdLines.push('### 🚦 Per-Route First Load JS');
  mdLines.push('');
  mdLines.push('| Route | First Load JS (gzip) | First Load JS (raw) | Route-Only JS (gzip) | Chunks |');
  mdLines.push('| :--- | :--- | :--- | :--- | :---: |');

  for (const r of routesData) {
    mdLines.push(`| \`${r.route}\` | **${r.firstLoadGzipFormatted}** | ${r.firstLoadRawFormatted} | ${r.routeGzipFormatted} | ${r.chunkCount} |`);
  }
  mdLines.push('');
}

// Largest Chunks Table
if (top5Chunks.length > 0) {
  mdLines.push('### 🔍 Largest Chunks (Top 5)');
  mdLines.push('');
  mdLines.push('| Chunk File | Gzip Size | Raw Size |');
  mdLines.push('| :--- | :--- | :--- |');

  for (const c of top5Chunks) {
    mdLines.push(`| \`${c.file}\` | ${c.gzipFormatted} | ${c.rawFormatted} |`);
  }
  mdLines.push('');
}

// Treemap Artifact Notice
mdLines.push('### 📊 Visual Treemap Artifacts');
mdLines.push('');
if (hasClientTreemap || hasNodejsTreemap) {
  mdLines.push('Interactive treemap reports were generated:');
  if (hasClientTreemap) mdLines.push('- `client.html` (Client bundle breakdown)');
  if (hasNodejsTreemap) mdLines.push('- `nodejs.html` (Node.js/Server bundle breakdown)');
  mdLines.push('');
  mdLines.push('> 💡 Download the **`bundle-analysis-report`** artifact from this CI run and open `client.html` in your browser to explore module sizes.');
} else {
  mdLines.push('> ℹ️ To generate the interactive HTML treemap locally or in CI on budget failure, run `pnpm run analyze` (or pass `ANALYZE=true`). Treemap files will be saved in `.next/analyze/`.');
}
mdLines.push('');

const reportMarkdown = mdLines.join('\n');
const reportMdPath = path.join(analyzeDir, 'bundle-report.md');
fs.writeFileSync(reportMdPath, reportMarkdown);

console.log(reportMarkdown);
