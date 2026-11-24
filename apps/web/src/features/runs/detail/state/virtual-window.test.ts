import { describe, expect, it } from 'vitest';
import { clampScrollTop, computeVirtualWindow } from './virtual-window';

describe('virtual window', () => {
  const input = {
    itemCount: 10_000,
    itemHeight: 24,
    scrollTop: 24_000,
    viewportHeight: 600,
  };

  it('returns a small window for large collections', () => {
    const window = computeVirtualWindow(input);
    expect(window.startIndex).toBe(996);
    expect(window.endIndex).toBe(1030);
    expect(window.endIndex - window.startIndex).toBeLessThan(70);
    expect(window.paddingTop).toBe(996 * 24);
  });

  it('handles the first and last pages', () => {
    expect(computeVirtualWindow({ ...input, scrollTop: 0 }).startIndex).toBe(0);
    const end = computeVirtualWindow({ ...input, scrollTop: 24 * 9_800 });
    expect(end.endIndex).toBe(9830);
    expect(end.paddingBottom).toBe((10_000 - 9830) * 24);
  });

  it('is resilient to invalid input', () => {
    expect(computeVirtualWindow({ ...input, itemCount: 0 })).toEqual({
      startIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
    });
    expect(computeVirtualWindow({ ...input, itemHeight: 0 }).endIndex).toBe(0);
    expect(computeVirtualWindow({ ...input, scrollTop: Number.NaN }).startIndex).toBe(0);
  });

  it('clamps scroll offsets to the list height', () => {
    expect(clampScrollTop(-10, 100, 24, 600)).toBe(0);
    expect(clampScrollTop(100_000, 100, 24, 600)).toBe(1800);
    expect(clampScrollTop(Number.NaN, 100, 24, 600)).toBe(0);
  });
});
