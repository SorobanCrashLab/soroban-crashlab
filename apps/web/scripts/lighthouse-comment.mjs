/**
 * Renders the Lighthouse CI results as a compact markdown score table.
 *
 * Writes `.lighthouseci/comment.md` for the sticky PR comment and echoes the
 * same markdown to stdout for the job summary.
 *
 * Two form-factor runs land in `.lighthouseci-desktop/` and
 * `.lighthouseci-mobile/` (staged by the workflow); each is rendered as its
 * own table, and the verdict line reflects both. On failure it prints one
 * line per broken assertion naming the route, the audit, the budget and the
 * measured value.
 *
 * Issue: #1408 - Lighthouse CI budgets on key pages with PR score comments
 * Issue: #1652 - Lighthouse CI enforcement (mobile preset, LHR artifacts)
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE = process.cwd();
const OUT_FILE = path.join(WORKSPACE, '.lighthouseci', 'comment.md');

/** Form-factor runs, newest staging convention first. */
const RUN_DIRS = [
  { label: 'Desktop', dir: '.lighthouseci-desktop', title: '### 🖥️ Desktop' },
  { label: 'Mobile', dir: '.lighthouseci-mobile', title: '### 📱 Mobile' },
];

/** Reads a JSON artifact LHCI may or may not have produced. */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** `http://127.0.0.1:3210/runs` -> `/runs` */
function toRoute(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Median of a numeric list.
 *
 * This mirrors how LHCI aggregates the runs before asserting, so the numbers
 * in the table are the same ones the budgets were checked against.
 */
function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 0.93 -> "93" ; missing -> "—" */
function score(value) {
  return typeof value === 'number' ? String(Math.round(value * 100)) : '—';
}

/**
 * Builds url -> (metric key -> passed|failed) from assertion-results.json.
 *
 * LHCI category assertions arrive as `auditId: "categories"` with the property
 * in `auditProperty` (e.g. "performance"), while numeric audits use the audit
 * id directly (e.g. "largest-contentful-paint"). Only FAILED assertions are
 * recorded in assertion-results.json; every row we render is asserted on every
 * route by both configs, so an absent entry means the budget passed.
 */
function assertionMap(assertions) {
  const byUrl = new Map();
  for (const a of assertions) {
    if (!a.url) continue;
    const key = a.auditProperty ? `${a.auditId}:${a.auditProperty}` : a.auditId;
    if (!byUrl.has(a.url)) byUrl.set(a.url, new Map());
    byUrl.get(a.url).set(key, a.passed === true);
  }
  return byUrl;
}

/** 🟢 when the route's assertion passed (or was not recorded), 🔴 on failure. */
function gateIcon(assertByUrl, url, key) {
  return assertByUrl.get(url)?.get(key) === false ? '🔴' : '🟢';
}

/** Milliseconds -> "1.80 s"; unitless metrics (CLS) keep three decimals. */
function formatValue(auditId, value) {
  if (typeof value !== 'number') return String(value);
  if (auditId === 'cumulative-layout-shift') return value.toFixed(3);
  if (auditId === 'categories:performance' || auditId === 'categories:accessibility') {
    return String(Math.round(value * 100));
  }
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

/**
 * Loads a run directory: medians per URL plus the assertion results.
 * Returns null when the directory has no LHR samples.
 */
function loadRunDir(run) {
  const dirPath = path.join(WORKSPACE, run.dir);
  if (!fs.existsSync(dirPath)) return null;

  const reportFiles = fs
    .readdirSync(dirPath)
    .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
    .map((f) => path.join(dirPath, f));

  if (reportFiles.length === 0) return null;

  const byUrl = new Map();
  for (const file of reportFiles) {
    const lhr = readJson(file, null);
    if (!lhr?.requestedUrl) continue;
    const samples = byUrl.get(lhr.requestedUrl) ?? [];
    samples.push({
      performance: lhr.categories?.performance?.score,
      accessibility: lhr.categories?.accessibility?.score,
      lcp: lhr.audits?.['largest-contentful-paint']?.numericValue,
      cls: lhr.audits?.['cumulative-layout-shift']?.numericValue,
    });
    byUrl.set(lhr.requestedUrl, samples);
  }

  const assertions = readJson(path.join(dirPath, 'assertion-results.json'), []);
  const links = readJson(path.join(dirPath, 'links.json'), {});
  const sampleCount = Math.max(...[...byUrl.values()].map((samples) => samples.length));

  return { byUrl, assertions, links, sampleCount, assertByUrl: assertionMap(assertions) };
}

const lines = [];
lines.push('## 🚦 Lighthouse budgets');
lines.push('');

const runs = RUN_DIRS.map((run) => ({ ...run, data: loadRunDir(run) })).filter((run) => run.data !== null);

if (runs.length === 0) {
  lines.push('> Lighthouse produced no reports — the collect step failed before');
  lines.push('> any route was audited. Check the job log for the server startup.');
  emit();
  process.exit(0);
}

const totalFailures = runs.reduce((sum, run) => sum + run.data.assertions.filter((a) => !a.passed).length, 0);

if (totalFailures === 0) {
  lines.push('✅ **All budgets met** across every form factor and route.');
} else {
  lines.push(`❌ **${totalFailures} budget ${totalFailures === 1 ? 'miss' : 'misses'}** across ${runs.length} form factor${runs.length === 1 ? '' : 's'}.`);
}
lines.push('');

for (let index = 0; index < runs.length; index += 1) {
  const run = runs[index];
  const { byUrl, assertions, links, sampleCount, assertByUrl } = run.data;

  if (index > 0) lines.push('');
  lines.push(run.title);
  lines.push('');
  lines.push(`Median of ${sampleCount} runs per route · pinned Slow-4G throttling.`);
  lines.push('');
  lines.push('| Route | Perf | A11y | LCP | CLS | Report |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const [url, samples] of byUrl) {
    const pick = (key) => median(samples.map((s) => s[key]).filter((v) => typeof v === 'number'));
    const perf = pick('performance');
    const a11y = pick('accessibility');
    const lcp = pick('lcp');
    const cls = pick('cls');
    const link = links[url];

    lines.push(
      `| \`${toRoute(url)}\` | ${gateIcon(assertByUrl, url, 'categories:performance')} ${score(perf)} ` +
        `| ${gateIcon(assertByUrl, url, 'categories:accessibility')} ${score(a11y)} ` +
        `| ${gateIcon(assertByUrl, url, 'largest-contentful-paint')} ${lcp === undefined ? '—' : formatValue('largest-contentful-paint', lcp)} ` +
        `| ${gateIcon(assertByUrl, url, 'cumulative-layout-shift')} ${cls === undefined ? '—' : formatValue('cumulative-layout-shift', cls)} ` +
        `| ${link ? `[report](${link})` : '—'} |`,
    );
  }

  const failures = assertions.filter((a) => !a.passed);
  if (failures.length > 0) {
    lines.push('');
    lines.push(`_${failures.length} ${failures.length === 1 ? 'miss' : 'misses'} on this form factor._`);
    lines.push('');
    lines.push('| Route | Audit | Budget | Measured |');
    lines.push('| --- | --- | --- | --- |');

    for (const failure of failures) {
      // Category assertions arrive as `auditId: "categories"` with the property
      // (e.g. "performance") in `auditProperty`; compose them so the label and
      // value formatter (score-hundreds vs ms) resolve correctly.
      const auditId = failure.auditProperty
        ? `${failure.auditId}:${failure.auditProperty}`
        : (failure.auditId ?? failure.name);
      const comparator = failure.operator === '>=' ? '≥' : '≤';
      lines.push(
        `| \`${toRoute(failure.url ?? '')}\` | \`${auditId}\` ` +
          `| ${comparator} ${formatValue(auditId, failure.expected)} ` +
          `| **${formatValue(auditId, failure.actual)}** |`,
      );
    }
  }
}

lines.push('');
lines.push(
  '<sub>CI gate only — no dashboards, no RUM. Budgets, their derivation and the ' +
    'variance study live in `apps/web/lighthouserc.js` and `lighthouserc.mobile.js`.</sub>',
);

emit();

function emit() {
  const output = lines.join('\n');
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output);
  console.log(output);
}