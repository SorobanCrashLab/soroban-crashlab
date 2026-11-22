import { describe, expect, it } from 'vitest';
import {
  eventsEqual,
  findFirstDivergence,
  scoreDivergence,
  stableStringify,
  type TraceEvent,
} from './first-divergence';

const trace: TraceEvent[] = [
  { anchor: 'phase:init', payload: { seed: 1 } },
  { anchor: 'instr:call', payload: { fn: 'transfer', args: [1, 2] } },
  { anchor: 'event:emit', payload: { topic: 'ok' } },
];

describe('stableStringify', () => {
  it('ignores object key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('keeps array order significant', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe('eventsEqual', () => {
  it('treats reordered payload keys as equal', () => {
    expect(eventsEqual({ anchor: 'a', payload: { x: 1, y: 2 } }, { anchor: 'a', payload: { y: 2, x: 1 } })).toBe(true);
  });

  it('detects anchor and payload differences', () => {
    expect(eventsEqual({ anchor: 'a', payload: 1 }, { anchor: 'b', payload: 1 })).toBe(false);
    expect(eventsEqual({ anchor: 'a', payload: 1 }, { anchor: 'a', payload: 2 })).toBe(false);
  });
});

describe('findFirstDivergence', () => {
  it('returns null for identical traces', () => {
    expect(findFirstDivergence(trace, trace.map((e) => ({ ...e })))).toBeNull();
  });

  it('pinpoints the first payload mismatch and counts the matched prefix', () => {
    const candidate = trace.map((e) => ({ ...e }));
    candidate[1] = { anchor: 'instr:call', payload: { fn: 'transfer', args: [1, 3] } };
    candidate[2] = { anchor: 'event:emit', payload: { topic: 'fail' } };

    const result = findFirstDivergence(trace, candidate);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('mismatch');
    expect(result!.index).toBe(1);
    expect(result!.matchedPrefix).toBe(1);
  });

  it('reports a base trace that ends early', () => {
    const result = findFirstDivergence(trace.slice(0, 2), trace);
    expect(result).toMatchObject({ kind: 'base-ended', index: 2, matchedPrefix: 2 });
  });

  it('reports a candidate trace that ends early', () => {
    const result = findFirstDivergence(trace, trace.slice(0, 1));
    expect(result).toMatchObject({ kind: 'candidate-ended', index: 1, matchedPrefix: 1 });
  });

  it('is deterministic for repeated calls', () => {
    const candidate = [trace[0], { anchor: 'x' }, trace[2]];
    expect(findFirstDivergence(trace, candidate)).toEqual(findFirstDivergence(trace, candidate));
  });
});

describe('scoreDivergence', () => {
  it('keeps confidence within [0, 1]', () => {
    expect(scoreDivergence('mismatch', 0, 0)).toBeGreaterThanOrEqual(0);
    expect(scoreDivergence('mismatch', 100, 100)).toBeLessThanOrEqual(1);
  });

  it('scores a mismatch above a trace that merely ends', () => {
    expect(scoreDivergence('mismatch', 2, 4)).toBeGreaterThan(scoreDivergence('base-ended', 2, 4));
  });
});
