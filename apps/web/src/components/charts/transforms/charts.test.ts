import * as assert from 'node:assert/strict';
import { downsample, lttb, minMaxBuckets, sliceRange, type Point } from './downsample';
import { normalizeSeries, shiftSeries, valueDomain } from './normalize';
import { createSyncGroup } from '../hooks/syncGroup';
import { decodeChartState, encodeChartState } from '../../../features/analytics/charts/ChartStateUrl';

function series(n: number, f: (i: number) => number): Point[] {
  return Array.from({ length: n }, (_, i) => ({ t: i * 1000, v: f(i) }));
}

// LTTB bounds output, keeps endpoints, and is deterministic.
{
  const data = series(100_000, (i) => Math.sin(i / 500) * 100);
  const a = lttb(data, 500);
  const b = lttb(data, 500);
  assert.equal(a.points.length, 500);
  assert.deepEqual(a.points, b.points);
  assert.equal(a.points[0], data[0]);
  assert.equal(a.points[499], data[data.length - 1]);
  assert.equal(a.reduced, true);
  assert.ok(a.fidelity < 0.01);
}

// Small inputs are returned untouched.
{
  const data = series(10, (i) => i);
  const r = lttb(data, 50);
  assert.equal(r.points.length, 10);
  assert.equal(r.reduced, false);
  assert.equal(r.fidelity, 1);
}

// Min/max buckets never lose a spike.
{
  const data = series(10_000, () => 1);
  data[4321] = { t: data[4321].t, v: 9999 };
  const r = minMaxBuckets(data, 100);
  assert.ok(r.points.length <= 200);
  assert.ok(r.points.some((p) => p.v === 9999));
  for (let i = 1; i < r.points.length; i += 1) assert.ok(r.points[i].t >= r.points[i - 1].t);
}

assert.equal(downsample(series(1000, (i) => i), 'none', 10).points.length, 1000);
assert.equal(sliceRange(series(10, (i) => i), 2000, 4000).length, 3);

// Normalization.
{
  const d = series(3, (i) => [50, 100, 25][i]);
  assert.deepEqual(normalizeSeries(d, 'percent').map((p) => p.v), [0, 100, -50]);
  assert.deepEqual(normalizeSeries(d, 'index').map((p) => p.v), [100, 200, 50]);
  const z = normalizeSeries(d, 'zscore').map((p) => p.v);
  assert.ok(Math.abs(z.reduce((s, v) => s + v, 0)) < 1e-9);
  // Zero base never yields NaN/Infinity.
  const zero = normalizeSeries(series(2, (i) => [0, 5][i]), 'percent');
  assert.ok(zero.every((p) => Number.isFinite(p.v)));
  assert.deepEqual(normalizeSeries(series(3, () => 7), 'zscore').map((p) => p.v), [0, 0, 0]);
  assert.equal(shiftSeries(d, 500)[0].t, 500);
  assert.deepEqual(valueDomain(series(2, (i) => [0, 100][i])), [-5, 105]);
}

// Synced cursor groups notify once per change.
{
  const g = createSyncGroup();
  let calls = 0;
  const off = g.subscribe(() => { calls += 1; });
  g.setCursor(5);
  g.setCursor(5);
  g.setRange([1, 2]);
  g.setRange([1, 2]);
  assert.equal(calls, 2);
  assert.deepEqual(g.get(), { cursor: 5, range: [1, 2] });
  off();
  g.setCursor(6);
  assert.equal(calls, 2);
}

// URL state round-trips and rejects bad input.
{
  const state = { range: [1000, 5000] as [number, number], series: ['crash', 'latency'], normalize: 'zscore' as const, compare: true };
  assert.deepEqual(decodeChartState(encodeChartState(state)), state);
  const bad = decodeChartState('range=9-1&norm=evil&series=');
  assert.equal(bad.range, null);
  assert.equal(bad.normalize, 'none');
  assert.deepEqual(bad.series, []);
}

console.log('chart transforms: all tests passed');
