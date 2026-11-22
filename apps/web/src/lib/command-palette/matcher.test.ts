import { describe, it, expect } from 'vitest';
import { fuzzyMatch, highlightSegments } from './matcher';

describe('fuzzyMatch', () => {
  it('matches an empty query against anything with zero score', () => {
    expect(fuzzyMatch('', 'Go to Runs')).toEqual({ matched: true, score: 0, indices: [] });
  });

  it('rejects a query whose characters are not all present in order', () => {
    expect(fuzzyMatch('xyz', 'Go to Runs').matched).toBe(false);
  });

  it('rejects when the subsequence is out of order', () => {
    expect(fuzzyMatch('sr', 'Runs').matched).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('RUNS', 'go to runs').matched).toBe(true);
  });

  it('scores a contiguous prefix match higher than a scattered match', () => {
    const contiguous = fuzzyMatch('run', 'Runs');
    const scattered = fuzzyMatch('run', 'Reproduction Unit Note');
    expect(contiguous.matched).toBe(true);
    expect(scattered.matched).toBe(true);
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  it('scores matches at word boundaries higher than mid-word matches', () => {
    // "cp" matches the leading letters of "Command Palette" (word starts)
    // vs. the middle of "Documentation Preview" (mid-word).
    const wordStart = fuzzyMatch('cp', 'Command Palette');
    const midWord = fuzzyMatch('cp', 'Documentation Preview');
    expect(wordStart.matched).toBe(true);
    expect(midWord.matched).toBe(true);
    expect(wordStart.score).toBeGreaterThan(midWord.score);
  });

  it('returns indices covering every matched character', () => {
    const result = fuzzyMatch('gr', 'Go to Runs');
    expect(result.matched).toBe(true);
    expect(result.indices).toEqual([0, 6]);
  });
});

describe('highlightSegments', () => {
  it('returns a single non-highlighted segment when there are no indices', () => {
    expect(highlightSegments('Runs', [])).toEqual([{ text: 'Runs', highlighted: false }]);
  });

  it('splits text into highlighted and plain runs', () => {
    expect(highlightSegments('Runs', [0, 1])).toEqual([
      { text: 'Ru', highlighted: true },
      { text: 'ns', highlighted: false },
    ]);
  });

  it('handles non-contiguous highlighted indices', () => {
    expect(highlightSegments('Go to Runs', [0, 6])).toEqual([
      { text: 'G', highlighted: true },
      { text: 'o to ', highlighted: false },
      { text: 'R', highlighted: true },
      { text: 'uns', highlighted: false },
    ]);
  });
});
