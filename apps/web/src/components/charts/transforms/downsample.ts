/**
 * Time-series downsampling (#2302).
 *
 * `lttb` (Largest-Triangle-Three-Buckets) keeps the visual shape of a series;
 * `minMaxBuckets` guarantees spikes survive. Both are deterministic and never
 * return more than `threshold` points. Inputs must be sorted by `t`.
 */

export interface Point {
  t: number;
  v: number;
}

export interface DownsampleResult {
  points: Point[];
  /** Input point count. */
  sourceCount: number;
  /** Fraction of source points retained (1 = full fidelity). */
  fidelity: number;
  /** True when the output is a reduction of the input. */
  reduced: boolean;
}

function result(points: Point[], sourceCount: number): DownsampleResult {
  return {
    points,
    sourceCount,
    fidelity: sourceCount === 0 ? 1 : points.length / sourceCount,
    reduced: points.length < sourceCount,
  };
}

export function lttb(data: Point[], threshold: number): DownsampleResult {
  const n = data.length;
  if (threshold >= n || threshold < 3) {
    return result(threshold < 3 && n > 2 ? [data[0], data[n - 1]] : data.slice(), n);
  }

  const sampled: Point[] = [data[0]];
  const every = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i += 1) {
    // Average of the next bucket is the third triangle vertex.
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgT = 0;
    let avgV = 0;
    for (let j = nextStart; j < nextEnd; j += 1) {
      avgT += data[j].t;
      avgV += data[j].v;
    }
    const nextLen = Math.max(nextEnd - nextStart, 1);
    avgT /= nextLen;
    avgV /= nextLen;

    const start = Math.floor(i * every) + 1;
    const end = Math.floor((i + 1) * every) + 1;
    let maxArea = -1;
    let chosen = start;
    for (let j = start; j < end; j += 1) {
      const area = Math.abs(
        (data[a].t - avgT) * (data[j].v - data[a].v) -
          (data[a].t - data[j].t) * (avgV - data[a].v),
      );
      if (area > maxArea) {
        maxArea = area;
        chosen = j;
      }
    }
    sampled.push(data[chosen]);
    a = chosen;
  }

  sampled.push(data[n - 1]);
  return result(sampled, n);
}

/** Keep the min and max of each of `buckets` equal-width buckets (spike safe). */
export function minMaxBuckets(data: Point[], buckets: number): DownsampleResult {
  const n = data.length;
  if (buckets < 1 || n <= buckets * 2) return result(data.slice(), n);

  const out: Point[] = [];
  const size = n / buckets;
  for (let b = 0; b < buckets; b += 1) {
    const lo = Math.floor(b * size);
    const hi = Math.min(Math.floor((b + 1) * size), n);
    if (lo >= hi) continue;
    let min = data[lo];
    let max = data[lo];
    for (let i = lo + 1; i < hi; i += 1) {
      if (data[i].v < min.v) min = data[i];
      if (data[i].v > max.v) max = data[i];
    }
    // Emit in time order.
    if (min === max) out.push(min);
    else if (min.t <= max.t) out.push(min, max);
    else out.push(max, min);
  }
  return result(out, n);
}

/** Restrict a sorted series to `[from, to]` (inclusive) for zoom drill-down. */
export function sliceRange(data: Point[], from: number, to: number): Point[] {
  return data.filter((p) => p.t >= from && p.t <= to);
}

export type DownsampleStrategy = 'lttb' | 'minmax' | 'none';

export function downsample(
  data: Point[],
  strategy: DownsampleStrategy,
  target: number,
): DownsampleResult {
  if (strategy === 'none') return result(data.slice(), data.length);
  return strategy === 'lttb' ? lttb(data, target) : minMaxBuckets(data, Math.max(1, Math.floor(target / 2)));
}
