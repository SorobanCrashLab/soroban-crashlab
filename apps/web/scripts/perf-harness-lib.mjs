/**
 * Pure helpers for the per-route performance harness (W5-D09 / #1881).
 *
 * Kept dependency-free so the CLI (`perf-harness.mjs`), the CI ratchet and the
 * Vitest suite all exercise the exact same comparison logic.
 */

/** Metrics measured from build manifests. Sizes are bytes. */
export const SIZE_METRICS = [
  'firstLoadJsGzip',
  'firstLoadJsRaw',
  'routeOnlyJsGzip',
  'routeOnlyJsRaw',
  'rscPayloadBytes',
  'htmlBytes',
];

/** Metrics measured against a running server / browser. Values are ms. */
export const TIMING_METRICS = ['hydrationMs', 'lcpMs', 'inpMs', 'ttfbMs'];

/** Runtime metrics that only exist when the harness runs with --base-url. */
export const RUNTIME_METRICS = ['rscPayloadBytes', 'htmlBytes', ...TIMING_METRICS];

/**
 * Absolute ceilings for browser timings. A p95 far below these thresholds is
 * not a user-visible regression, and local synthetic interactions are noisy
 * enough that gating at a 20 ms baseline would flap on every run. These match
 * the Web Vitals "good" band or a conservative local equivalent.
 */
export const TIMING_FLOORS_MS = {
  ttfbMs: 800,
  hydrationMs: 1500,
  lcpMs: 2500,
  inpMs: 1000,
};

export const DEFAULT_TOLERANCES = {
  /** First-load JS is deterministic for a given source tree. */
  sizePct: 0,
  /** The RSC payload is deterministic but may move a few bytes on refactors. */
  rscPct: 3,
  /** Browser timings are noisy; p95 + 25% catches regressions, not jitter. */
  timingPct: 25,
  /** Sub-100 ms metrics (TTFB, fast INP) need an absolute floor so a 20 ms
   *  sample does not turn into a 25% "regression". */
  timingFloorMs: 100,
};

const BUDGET_METRICS = new Set([...SIZE_METRICS, ...TIMING_METRICS]);

const BYTE_METRICS = new Set([
  'firstLoadJsGzip',
  'firstLoadJsRaw',
  'routeOnlyJsGzip',
  'routeOnlyJsRaw',
  'rscPayloadBytes',
  'htmlBytes',
]);

export function isSizeMetric(metric) {
  return BYTE_METRICS.has(metric);
}

export function metricTolerance(metric, tolerances = DEFAULT_TOLERANCES) {
  if (metric === 'rscPayloadBytes' || metric === 'htmlBytes') return tolerances.rscPct;
  if (TIMING_METRICS.includes(metric)) return tolerances.timingPct;
  return tolerances.sizePct;
}

/** Round a measured value up to a stable budget granularity. */
export function roundBudgetValue(metric, value) {
  if (!Number.isFinite(value)) return value;
  if (isSizeMetric(metric)) return Math.ceil(value / 256) * 256;
  return Math.ceil(value / 5) * 5;
}

/**
 * Nearest-rank percentile. Returns null for an empty sample set so callers do
 * not silently treat "no data" as zero.
 */
export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/** Summarize raw samples with the p95 the budget gate uses. */
export function summarizeSamples(values) {
  const clean = (values ?? []).filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
  if (clean.length === 0) return null;
  return {
    count: clean.length,
    min: Math.min(...clean),
    p50: percentile(clean, 50),
    p95: percentile(clean, 95),
    max: Math.max(...clean),
  };
}

const RSC_PUSH_PATTERN = /self\.__next_f\.push\(\s*\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\s*\)/g;

/**
 * Sum the UTF-8 bytes of the Flight/RSC chunks embedded in an App Router HTML
 * response. These are the bytes a client must parse before hydration and are
 * the payload the budget is meant to hold down (issue #1881).
 */
export function extractRscPayload(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return { bytes: 0, chunks: 0 };
  }
  let bytes = 0;
  let chunks = 0;
  RSC_PUSH_PATTERN.lastIndex = 0;
  for (const match of html.matchAll(RSC_PUSH_PATTERN)) {
    try {
      const decoded = JSON.parse(match[1]);
      bytes += Buffer.byteLength(decoded, 'utf8');
      chunks += 1;
    } catch {
      // A truncated or escaped chunk should not make the whole report throw.
      bytes += Buffer.byteLength(match[1], 'utf8');
      chunks += 1;
    }
  }
  return { bytes, chunks };
}

/** App Router manifest keys look like "/runs/page" or "/runs/[id]/page". */
export function normalizeRoute(rawRoute) {
  if (!rawRoute) return '/';
  let route = String(rawRoute).replace(/\/page$/, '');
  if (route === '' || route === 'page') route = '/';
  if (!route.startsWith('/')) route = `/${route}`;
  return route;
}

/** Resolve a dynamic route template to a fixture URL path. */
export function materializeRoute(route, fixtureRunId = 'run-1024') {
  if (!route.includes('[')) return route;
  return route
    .replace(/\[id\]/g, fixtureRunId)
    .replace(/\[slug\]/g, fixtureRunId);
}

export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function budgetFor(routeBudgets, metric) {
  const value = routeBudgets?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Compare a measured report with the committed budget.
 *
 * `requireRuntime` is used by the server/browser job: it turns a missing RSC or
 * timing measurement into a failure instead of silently passing. The offline
 * build-manifest job leaves it false.
 */
export function diffBudgets(baselineRoutes, measuredRoutes, options = {}) {
  const {
    tolerances = DEFAULT_TOLERANCES,
    requireRuntime = false,
    requireAllRoutes = true,
    enforceTiming = false,
    fixtureRunId = 'run-1024',
  } = options;
  const regressions = [];
  const advisory = [];
  const improvements = [];
  const missingRoutes = [];
  const missingMetrics = [];

  for (const [route, measured] of Object.entries(measuredRoutes ?? {})) {
    const budget = baselineRoutes?.[route];
    if (!budget) {
      missingRoutes.push(route);
      continue;
    }

    for (const [metric, measuredValue] of Object.entries(measured)) {
      if (!BUDGET_METRICS.has(metric)) continue;
      if (measuredValue === null || measuredValue === undefined) continue;
      if (typeof measuredValue !== 'number' || !Number.isFinite(measuredValue)) continue;
      const budgetValue = budgetFor(budget, metric);
      if (budgetValue === null) continue;

      const tolerance = metricTolerance(metric, tolerances);
      const floor = TIMING_METRICS.includes(metric) ? tolerances.timingFloorMs ?? 0 : 0;
      const absoluteFloor = TIMING_FLOORS_MS[metric] ?? 0;
      const allowed = Math.max(
        budgetValue * (1 + tolerance / 100) + floor,
        absoluteFloor,
      );
      const delta = measuredValue - budgetValue;
      const deltaPct = budgetValue > 0 ? (delta / budgetValue) * 100 : 0;
      const entry = {
        route,
        metric,
        budget: budgetValue,
        measured: measuredValue,
        delta,
        deltaPct,
        tolerancePct: tolerance,
      };
      if (measuredValue > allowed) {
        if (TIMING_METRICS.includes(metric) && !enforceTiming) advisory.push(entry);
        else regressions.push(entry);
      } else if (measuredValue < budgetValue) improvements.push(entry);
    }

    if (requireRuntime) {
      for (const metric of RUNTIME_METRICS) {
        if (!(metric in measured)) missingMetrics.push({ route, metric });
      }
    }
  }

  if (requireAllRoutes) {
    for (const route of Object.keys(baselineRoutes ?? {})) {
      if (!(route in (measuredRoutes ?? {}))) missingRoutes.push(route);
    }
  }

  return {
    ok: regressions.length === 0 && missingRoutes.length === 0 && missingMetrics.length === 0,
    regressions,
    advisory,
    improvements,
    missingRoutes: Array.from(new Set(missingRoutes)),
    missingMetrics,
    fixtureRunId,
  };
}

/**
 * Ratchet committed budgets down to the measured value. A measurement must beat
 * the current budget by more than the metric tolerance before it is adopted, so
 * byte-level build noise does not saw the baseline up and down on every PR.
 * Increases are refused unless `allowIncrease` is set (reviewed budget bump).
 */
export function ratchetBudgets(
  baselineRoutes,
  measuredRoutes,
  options = {},
) {
  const {
    tolerances = DEFAULT_TOLERANCES,
    allowIncrease = false,
    requireRuntime = false,
    reason = null,
  } = options;

  const nextRoutes = JSON.parse(JSON.stringify(baselineRoutes ?? {}));
  const changes = [];
  const blocked = [];

  for (const [route, measured] of Object.entries(measuredRoutes ?? {})) {
    if (!nextRoutes[route]) nextRoutes[route] = {};
    for (const [metric, measuredValue] of Object.entries(measured)) {
      if (!BUDGET_METRICS.has(metric)) continue;
      if (measuredValue === null || measuredValue === undefined) continue;
      if (typeof measuredValue !== 'number' || !Number.isFinite(measuredValue)) continue;

      const previous = budgetFor(nextRoutes[route], metric);
      const candidate = roundBudgetValue(metric, measuredValue);
      const tolerance = metricTolerance(metric, tolerances);
      // Budgets are stored rounded up. Ignore a one-bucket increase so the
      // rounding itself is not reported as an unreviewed regression.
      const roundingBucket = isSizeMetric(metric) ? 256 : 5;
      const timingFloor = TIMING_METRICS.includes(metric) ? tolerances.timingFloorMs ?? 0 : 0;
      const absoluteFloor = TIMING_FLOORS_MS[metric] ?? 0;

      if (previous === null) {
        nextRoutes[route][metric] = candidate;
        changes.push({ route, metric, previous, next: candidate, kind: 'add', reason });
        continue;
      }

      if (candidate < previous * (1 - tolerance / 100)) {
        nextRoutes[route][metric] = candidate;
        changes.push({ route, metric, previous, next: candidate, kind: 'decrease', reason });
      } else if (
        candidate > previous * (1 + tolerance / 100) + roundingBucket + timingFloor &&
        candidate > absoluteFloor
      ) {
        if (!allowIncrease) {
          blocked.push({ route, metric, previous, measured: candidate, tolerancePct: tolerance });
        } else {
          nextRoutes[route][metric] = candidate;
          changes.push({ route, metric, previous, next: candidate, kind: 'increase', reason });
        }
      }
    }
  }

  if (requireRuntime) {
    for (const [route, values] of Object.entries(measuredRoutes ?? {})) {
      for (const metric of RUNTIME_METRICS) {
        if (!(metric in values)) blocked.push({ route, metric, previous: null, measured: null, reason: 'missing' });
      }
    }
  }

  return { routes: nextRoutes, changes, blocked };
}

export function validateBudgetFile(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['perf-budgets.json must be an object'];
  }
  if (data.version !== 1) errors.push('version must be 1');
  if (!data.routes || typeof data.routes !== 'object' || Array.isArray(data.routes)) {
    errors.push('routes must be an object keyed by route path');
    return errors;
  }
  const routes = Object.keys(data.routes);
  if (routes.length === 0) errors.push('routes must not be empty');
  for (const route of routes) {
    if (!route.startsWith('/')) errors.push(`route "${route}" must start with /`);
    const values = data.routes[route];
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      errors.push(`route "${route}" must map to an object`);
      continue;
    }
    if (typeof values.firstLoadJsGzip !== 'number' || values.firstLoadJsGzip <= 0) {
      errors.push(`route "${route}" needs a positive firstLoadJsGzip`);
    }
    for (const [metric, value] of Object.entries(values)) {
      if (value === null) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        errors.push(`route "${route}" metric "${metric}" must be a non-negative number`);
      }
    }
  }
  return errors;
}

/** Deterministic fixture used by the vitest p95 assertion and by examples. */
export function mean(values) {
  const clean = (values ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function standardDeviation(values) {
  const clean = (values ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (clean.length < 2) return 0;
  const avg = mean(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (clean.length - 1));
}

export function confidenceInterval(values, confidence = 0.95) {
  const clean = (values ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!clean.length) return null;
  const avg = mean(clean);
  if (clean.length === 1) return { mean: avg, low: avg, high: avg, confidence };
  const margin = 1.96 * standardDeviation(clean) / Math.sqrt(clean.length);
  return { mean: avg, low: avg - margin, high: avg + margin, confidence };
}

export function welchTTest(baseline, candidate) {
  const a = (baseline ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  const b = (candidate ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (a.length < 2 || b.length < 2) return { test: 'welch-t', significant: false, pValue: 1, deltaPct: 0 };
  const aMean = mean(a); const bMean = mean(b);
  const aVar = standardDeviation(a) ** 2 / a.length;
  const bVar = standardDeviation(b) ** 2 / b.length;
  const standardError = Math.sqrt(aVar + bVar);
  if (standardError === 0) return { test: 'welch-t', significant: false, pValue: aMean === bMean ? 1 : 0, deltaPct: aMean ? (bMean - aMean) / aMean * 100 : 0 };
  const t = (bMean - aMean) / standardError;
  const df = (aVar + bVar) ** 2 / ((aVar ** 2 / (a.length - 1)) + (bVar ** 2 / (b.length - 1)));
  const pValue = 2 * (1 - normalCdf(Math.abs(t) / Math.sqrt(1 + 1 / df)));
  const deltaPct = aMean ? (bMean - aMean) / aMean * 100 : 0;
  return { test: 'welch-t', significant: pValue < 0.05, pValue: Math.max(0, Math.min(1, pValue)), deltaPct };
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function mannWhitneyU(baseline, candidate) {
  const a = (baseline ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  const b = (candidate ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!a.length || !b.length) return { test: 'mann-whitney', significant: false, pValue: 1, u: 0, deltaPct: 0 };
  const combined = [...a.map((value) => ({ value, group: 'a' })), ...b.map((value) => ({ value, group: 'b' }))].sort((x, y) => x.value - y.value);
  let rankSumA = 0;
  for (let i = 0; i < combined.length;) {
    let j = i + 1;
    while (j < combined.length && combined[j].value === combined[i].value) j++;
    const rank = ((i + 1) + j) / 2;
    for (let k = i; k < j; k++) if (combined[k].group === 'a') rankSumA += rank;
    i = j;
  }
  const u = rankSumA - a.length * (a.length + 1) / 2;
  const meanU = a.length * b.length / 2;
  const stdU = Math.sqrt(a.length * b.length * (a.length + b.length + 1) / 12);
  const z = stdU ? (u - meanU) / stdU : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const aMean = mean(a); const bMean = mean(b);
  return { test: 'mann-whitney', significant: pValue < 0.05, pValue: Math.max(0, Math.min(1, pValue)), u, deltaPct: aMean ? (bMean - aMean) / aMean * 100 : 0 };
}

export function compareBenchmarkSamples(baseline, candidate, options = {}) {
  const test = options.method === 'mann-whitney' ? mannWhitneyU(baseline, candidate) : welchTTest(baseline, candidate);
  const ci = confidenceInterval(candidate, options.confidence ?? 0.95);
  const tolerancePct = options.tolerancePct ?? 20;
  const isRegression = test.deltaPct > tolerancePct && test.significant;
  return { ...test, confidenceInterval: ci, isRegression };
}

export function formatBenchmarkPrComment(results = []) {
  const regressions = results.filter((result) => result.isRegression);
  if (!regressions.length) return '## Benchmark comparison\n\nNo statistically significant performance regressions detected.';
  const lines = regressions.map((result) => `- **${result.metric ?? result.route ?? 'benchmark'}**: ${result.deltaPct.toFixed(2)}% slower; p=${result.pValue.toFixed(4)}`);
  return ['## Benchmark comparison', '', 'Performance regressions detected:', '', ...lines].join('\n');
}

export const BENCHMARK_METRICS = ['gas', 'executionTime', 'memory', 'cpu', 'storage'];

export const compareBenchmarkSets = compareBenchmarkSamples;
export const benchmarkConfidenceInterval = confidenceInterval;
export const fixtureRouteSamples = function fixtureRouteSamples() {
  const sample = (start, step) => Array.from({ length: 20 }, (_, i) => start + step * i);
  return {
    route: '/runs',
    samples: {
      firstLoadJsGzip: sample(180_000, 0),
      rscPayloadBytes: sample(40_000, 0),
      hydrationMs: sample(80, 7),
      lcpMs: sample(1800, 55),
      inpMs: sample(40, 2),
      htmlBytes: sample(60_000, 0),
      ttfbMs: sample(20, 1),
    },
  };
}
