import { describe, expect, it } from 'vitest';
import {
  findUndersizedTargets,
  liveRegionMessage,
  meetsTargetSize,
  nextRovingIndex,
  normalizeTabOrder,
  resolveHighContrast,
  resolveReducedMotion,
  type FocusableDescriptor,
} from './wcag22';

const items: FocusableDescriptor[] = [
  { id: 'a', kind: 'button', tabIndex: 0 },
  { id: 'b', kind: 'button', tabIndex: 0 },
  { id: 'c', kind: 'custom', tabIndex: 0, disabled: true },
];

describe('WCAG 2.2 AA helpers', () => {
  it('keeps a single tab stop in composite widgets', () => {
    const normalized = normalizeTabOrder(items, 'b');
    expect(normalized.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves roving focus with arrow keys, Home and End', () => {
    expect(nextRovingIndex(3, 0, 'ArrowRight')).toBe(1);
    expect(nextRovingIndex(3, 0, 'ArrowLeft')).toBe(2);
    expect(nextRovingIndex(3, 1, 'End')).toBe(2);
    expect(nextRovingIndex(3, 1, 'Home')).toBe(0);
    expect(nextRovingIndex(3, 1, 'ArrowDown', false)).toBe(2);
    expect(nextRovingIndex(0, 0, 'ArrowRight')).toBe(-1);
  });

  it('applies the 24px target-size minimum with spacing allowance', () => {
    expect(meetsTargetSize({ width: 24, height: 24 })).toBe(true);
    expect(meetsTargetSize({ width: 20, height: 20, spacing: 24 })).toBe(true);
    expect(meetsTargetSize({ width: 20, height: 20, spacing: 8 })).toBe(false);
    expect(findUndersizedTargets([{ width: 24, height: 24 }, { width: 10, height: 10 }])).toEqual([1]);
  });

  it('resolves user motion and contrast preferences', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
    expect(resolveHighContrast('system', true)).toBe(true);
    expect(resolveHighContrast('normal', true)).toBe(false);
  });

  it('normalizes live-region messages', () => {
    expect(liveRegionMessage('  Run   finished ')).toBe('Run finished');
    expect(liveRegionMessage('x'.repeat(300))).toHaveLength(240);
  });
});
