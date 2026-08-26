import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DISTANCE_THRESHOLD,
  VELOCITY_THRESHOLD,
  LEFT_EDGE_EXCLUSION_PX,
} from './use-swipe-gesture';
import {
  captureRunListContext,
  readRunListContext,
  resolveNeighbors,
  clearRunListContext,
  type RunListContext,
} from './run-list-context';

describe('Swipe gesture constants', () => {
  it('DISTANCE_THRESHOLD is 80px', () => {
    expect(DISTANCE_THRESHOLD).toBe(80);
  });

  it('VELOCITY_THRESHOLD is 0.5px/ms', () => {
    expect(VELOCITY_THRESHOLD).toBe(0.5);
  });

  it('LEFT_EDGE_EXCLUSION_PX is 24px', () => {
    expect(LEFT_EDGE_EXCLUSION_PX).toBe(24);
  });
});

describe('Run list context', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    });
  });

  it('capture and read round-trips correctly', () => {
    const ids = ['run-1', 'run-2', 'run-3'];
    const filters = { status: 'failed' };
    const sort = { key: 'duration', direction: 'asc' };
    captureRunListContext(ids, filters, sort);

    const ctx = readRunListContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.ids).toEqual(ids);
    expect(ctx!.filters).toEqual(filters);
    expect(ctx!.sort).toEqual(sort);
  });

  it('returns null when nothing captured', () => {
    const ctx = readRunListContext();
    expect(ctx).toBeNull();
  });

  it('clears context', () => {
    captureRunListContext(['run-1']);
    expect(readRunListContext()).not.toBeNull();
    clearRunListContext();
    expect(readRunListContext()).toBeNull();
  });

  it('returns null for expired context', () => {
    const ids = ['run-1'];
    captureRunListContext(ids);
    const raw = store['crashlab-run-list-context'];
    const parsed = JSON.parse(raw!);
    parsed.capturedAt = Date.now() - 10 * 60 * 1000;
    store['crashlab-run-list-context'] = JSON.stringify(parsed);
    expect(readRunListContext()).toBeNull();
  });
});

describe('resolveNeighbors', () => {
  const ctx: RunListContext = {
    ids: ['a', 'b', 'c', 'd'],
    filters: {},
    sort: { key: 'queuedAt', direction: 'desc' },
    capturedAt: Date.now(),
  };

  it('returns prev and next for middle element', () => {
    const result = resolveNeighbors('b', ctx);
    expect(result.prev).toBe('a');
    expect(result.next).toBe('c');
  });

  it('returns null prev for first element', () => {
    const result = resolveNeighbors('a', ctx);
    expect(result.prev).toBeNull();
    expect(result.next).toBe('b');
  });

  it('returns null next for last element', () => {
    const result = resolveNeighbors('d', ctx);
    expect(result.prev).toBe('c');
    expect(result.next).toBeNull();
  });

  it('returns nulls when current id not in context', () => {
    const result = resolveNeighbors('x', ctx);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });

  it('returns nulls when context is null', () => {
    const result = resolveNeighbors('a', null);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
