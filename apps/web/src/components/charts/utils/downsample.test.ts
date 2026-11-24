import { describe, expect, it } from 'vitest';
import { downsampleMinMax } from './downsample';
import { getDomain } from './scales';
import { chartDataToCsv } from './export';
import type { ChartPoint } from '../types';

describe('chart utilities', () => {
  it('limits a 100k series while retaining endpoints and bucket extrema', () => {
    const points = Array.from({ length: 100_000 }, (_, x) => ({ x, y: x === 50_000 ? 10_000 : Math.sin(x / 20) }));
    const sampled = downsampleMinMax(points, 500);

    expect(sampled.length).toBeLessThanOrEqual(1002);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
    expect(sampled).toContain(points[50_000]);
  });

  it('rejects invalid resolutions and computes domains for large arrays', () => {
    expect(() => downsampleMinMax<ChartPoint>([], 0)).toThrow(RangeError);
    expect(getDomain(Array.from({ length: 100_000 }, (_, index) => index))).toEqual({ min: 0, max: 99_999 });
  });

  it('exports aligned, escaped CSV rows for multiple series', () => {
    const csv = chartDataToCsv([
      { id: 'one', label: 'One', data: [{ x: 'a,"b', y: 1 }, { x: 'next', y: 2 }] },
      { id: 'two', label: 'Two', data: [{ x: 'a,"b', y: 3 }] },
    ]);

    expect(csv).toBe('x,one,two\r\n"a,""b",1,3\r\nnext,2,');
  });
});
