/**
 * Series normalization for comparing metrics with different units (#2302).
 */

import type { Point } from './downsample';

export type NormalizeMode = 'none' | 'percent' | 'zscore' | 'index';

export const NORMALIZE_LABELS: Record<NormalizeMode, string> = {
  none: 'Raw values',
  percent: '% change from first point',
  zscore: 'Z-score (std deviations)',
  index: 'Index (first point = 100)',
};

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function normalizeSeries(data: Point[], mode: NormalizeMode): Point[] {
  if (mode === 'none' || data.length === 0) return data.slice();

  if (mode === 'zscore') {
    const values = data.map((p) => p.v);
    const m = mean(values);
    const sd = stdDev(values);
    return data.map((p) => ({ t: p.t, v: sd === 0 ? 0 : (p.v - m) / sd }));
  }

  const base = data[0].v;
  if (base === 0) {
    // Cannot express relative change from zero; report 0 rather than Infinity/NaN.
    return data.map((p) => ({ t: p.t, v: mode === 'index' ? 100 : 0 }));
  }
  return data.map((p) => ({
    t: p.t,
    v: mode === 'percent' ? ((p.v - base) / Math.abs(base)) * 100 : (p.v / base) * 100,
  }));
}

/** Shift a series forward in time by `offsetMs` (compare-to-previous-period overlay). */
export function shiftSeries(data: Point[], offsetMs: number): Point[] {
  return data.map((p) => ({ t: p.t + offsetMs, v: p.v }));
}

/** Compute a "nice" [min, max] domain for a value axis, with 5% padding. */
export function valueDomain(data: Point[]): [number, number] {
  if (data.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const p of data) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}
