import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TOLERANCES,
  TIMING_FLOORS_MS,
  diffBudgets,
  extractRscPayload,
  fixtureRouteSamples,
  percentile,
  ratchetBudgets,
  roundBudgetValue,
  summarizeSamples,
  validateBudgetFile,
} from '../../scripts/perf-harness-lib.mjs';

const CORE_ROUTES = [
  '/',
  '/dashboard',
  '/runs',
  '/runs/[id]',
  '/analytics',
  '/trends',
  '/triage',
  '/logs',
];

describe('perf harness statistics', () => {
  it('computes nearest-rank percentiles', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([], 95)).toBeNull();
    expect(percentile([42], 95)).toBe(42);
  });

  it('summarizes fixture samples at p95', () => {
    const fixture = fixtureRouteSamples();
    const summary = summarizeSamples(fixture.samples.lcpMs);
    expect(summary).not.toBeNull();
    expect(summary?.count).toBe(20);
    expect(summary?.p95).toBe(percentile(fixture.samples.lcpMs, 95));
    expect(summary?.p95).toBe(2790);
  });

  it('asserts the fixture p95 does not exceed a budget derived from it', () => {
    const fixture = fixtureRouteSamples();
    const p95ByMetric = Object.fromEntries(
      Object.entries(fixture.samples).map(([metric, samples]) => [
        metric,
        summarizeSamples(samples)?.p95,
      ]),
    );
    const baseline = {
      [fixture.route]: Object.fromEntries(
        Object.entries(p95ByMetric).map(([metric, value]) => [
          metric,
          roundBudgetValue(metric, value as number),
        ]),
      ),
    };
    const diff = diffBudgets(baseline, {
      [fixture.route]: p95ByMetric,
    }, { enforceTiming: true, requireRuntime: true });
    expect(diff.ok).toBe(true);
    expect(diff.regressions).toEqual([]);
  });
});

describe('RSC payload extraction', () => {
  it('sums decoded Flight chunks', () => {
    const html = [
      '<script>self.__next_f.push([1,"hello"])</script>',
      '<script>self.__next_f.push([1,"{\\"a\\":1}"])</script>',
    ].join('');
    const result = extractRscPayload(html);
    expect(result.chunks).toBe(2);
    expect(result.bytes).toBe(Buffer.byteLength('hello', 'utf8') + Buffer.byteLength('{"a":1}', 'utf8'));
  });

  it('handles escaped quotes and returns zero for plain HTML', () => {
    expect(extractRscPayload('self.__next_f.push([1,"a\\"b"])').bytes).toBe(3);
    expect(extractRscPayload('<html>no flight data</html>')).toEqual({ bytes: 0, chunks: 0 });
    expect(extractRscPayload('')).toEqual({ bytes: 0, chunks: 0 });
  });
});

describe('budget comparison and ratchet', () => {
  it('fails first-load JS growth beyond the exact size tolerance', () => {
    const baseline = { '/runs': { firstLoadJsGzip: 1000 } };
    expect(diffBudgets(baseline, { '/runs': { firstLoadJsGzip: 1001 } }).ok).toBe(false);
    const improved = diffBudgets(baseline, { '/runs': { firstLoadJsGzip: 900 } });
    expect(improved.ok).toBe(true);
    expect(improved.improvements).toHaveLength(1);
  });

  it('allows RSC payload movement inside its tolerance', () => {
    const baseline = { '/runs': { rscPayloadBytes: 10_000 } };
    expect(diffBudgets(baseline, { '/runs': { rscPayloadBytes: 10_300 } }).ok).toBe(true);
    expect(diffBudgets(baseline, { '/runs': { rscPayloadBytes: 10_301 } }).ok).toBe(false);
  });

  it('records noisy timings as advisory unless timing is enforced', () => {
    const baseline = { '/runs': { inpMs: 100 } };
    const measured = { '/runs': { inpMs: TIMING_FLOORS_MS.inpMs + 1 } };
    const advisory = diffBudgets(baseline, measured);
    expect(advisory.ok).toBe(true);
    expect(advisory.advisory).toHaveLength(1);
    const enforced = diffBudgets(baseline, measured, { enforceTiming: true });
    expect(enforced.ok).toBe(false);
    expect(enforced.regressions).toHaveLength(1);
  });

  it('fails routes missing from the budget and optional runtime metrics', () => {
    expect(diffBudgets({ '/runs': { firstLoadJsGzip: 1 } }, {}).ok).toBe(false);
    expect(
      diffBudgets({ '/runs': { firstLoadJsGzip: 1 } }, { '/runs': { firstLoadJsGzip: 1 } }, {
        requireAllRoutes: false,
      }).ok,
    ).toBe(true);
    const runtime = diffBudgets(
      { '/runs': { firstLoadJsGzip: 1, rscPayloadBytes: 1 } },
      { '/runs': { firstLoadJsGzip: 1 } },
      { requireRuntime: true },
    );
    expect(runtime.ok).toBe(false);
    expect(runtime.missingMetrics.length).toBeGreaterThan(0);
  });

  it('never raises a budget without a reviewed increase', () => {
    const baseline = { '/runs': { firstLoadJsGzip: 1000 } };
    const blocked = ratchetBudgets(baseline, { '/runs': { firstLoadJsGzip: 1200 } });
    expect(blocked.routes['/runs'].firstLoadJsGzip).toBe(1000);
    expect(blocked.blocked).toHaveLength(1);

    const allowed = ratchetBudgets(baseline, { '/runs': { firstLoadJsGzip: 1200 } }, {
      allowIncrease: true,
      reason: 'new route feature',
    });
    expect(allowed.routes['/runs'].firstLoadJsGzip).toBe(
      roundBudgetValue('firstLoadJsGzip', 1200),
    );
    expect(allowed.changes[0].reason).toBe('new route feature');
  });

  it('adopts decreases and ignores rounding-sized increases', () => {
    const baseline = { '/runs': { firstLoadJsGzip: 1000 } };
    expect(ratchetBudgets(baseline, { '/runs': { firstLoadJsGzip: 700 } }).routes['/runs'].firstLoadJsGzip)
      .toBe(roundBudgetValue('firstLoadJsGzip', 700));
    const tiny = ratchetBudgets(baseline, { '/runs': { firstLoadJsGzip: 1001 } });
    expect(tiny.routes['/runs'].firstLoadJsGzip).toBe(1000);
    expect(tiny.blocked).toHaveLength(0);
  });
});

describe('committed perf budget file', () => {
  const budgetPath = path.resolve(__dirname, '../../perf-budgets.json');
  const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

  it('is structurally valid', () => {
    expect(validateBudgetFile(budget)).toEqual([]);
    expect(budget.version).toBe(1);
    expect(Object.keys(budget.routes).length).toBeGreaterThan(50);
  });

  it('covers the core dashboard routes with runtime measurements', () => {
    for (const route of CORE_ROUTES) {
      expect(budget.routes[route], route).toBeDefined();
      expect(budget.routes[route].firstLoadJsGzip).toBeGreaterThan(0);
      expect(budget.routes[route].rscPayloadBytes).toBeGreaterThan(0);
      expect(budget.routes[route].lcpMs).toBeGreaterThan(0);
    }
    expect(budget.tolerances).toMatchObject({ sizePct: DEFAULT_TOLERANCES.sizePct });
  });

  it('records only positive byte budgets', () => {
    for (const [route, metrics] of Object.entries<Record<string, number>>(budget.routes)) {
      for (const metric of ['firstLoadJsGzip', 'firstLoadJsRaw', 'routeOnlyJsGzip', 'routeOnlyJsRaw']) {
        expect(metrics[metric], `${route} ${metric}`).toBeGreaterThanOrEqual(0);
      }
      expect(metrics.firstLoadJsGzip, route).toBeGreaterThan(0);
    }
  });
});
