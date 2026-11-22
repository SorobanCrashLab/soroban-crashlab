import { describe, it, expect } from 'vitest';
import { highlightMatches, highlightedExcerpt } from './fuzzy-search-utils';

/**
 * Highlighting tests (#1665).
 *
 * The contract the renderer depends on: concatenating every segment's `text`
 * must reproduce the input exactly, and `matched` must mark precisely the
 * query terms. Anything else would silently drop or duplicate characters in the
 * UI, which no type checker catches.
 */

/** Rebuilds the original string from segments. */
function reconstruct(segments: Array<{ text: string }>): string {
  return segments.map((segment) => segment.text).join('');
}

function matchedText(segments: Array<{ text: string; matched: boolean }>): string[] {
  return segments.filter((segment) => segment.matched).map((segment) => segment.text);
}

describe('highlightMatches', () => {
  it('returns no segments for an empty value', () => {
    expect(highlightMatches('', 'panic')).toEqual([]);
  });

  it('returns a single unmatched segment for an empty query', () => {
    expect(highlightMatches('run-001', '   ')).toEqual([
      { text: 'run-001', matched: false },
    ]);
  });

  it('returns a single unmatched segment when nothing matches', () => {
    expect(highlightMatches('run-001', 'zzz')).toEqual([
      { text: 'run-001', matched: false },
    ]);
  });

  it('marks a substring match and preserves surrounding text', () => {
    const segments = highlightMatches('sig:token:transfer', 'token');

    expect(reconstruct(segments)).toBe('sig:token:transfer');
    expect(matchedText(segments)).toEqual(['token']);
  });

  it('matches case-insensitively but returns the original casing', () => {
    const segments = highlightMatches('InvariantViolation', 'invariant');

    expect(matchedText(segments)).toEqual(['Invariant']);
    expect(reconstruct(segments)).toBe('InvariantViolation');
  });

  it('marks every occurrence of a repeated term', () => {
    const segments = highlightMatches('error in error handler', 'error');

    expect(matchedText(segments)).toEqual(['error', 'error']);
    expect(reconstruct(segments)).toBe('error in error handler');
  });

  it('marks multiple whitespace-separated terms regardless of order', () => {
    const segments = highlightMatches('sig:router:swap:budget_cpu_limit', 'router budget');

    expect(matchedText(segments)).toEqual(['router', 'budget']);
    expect(reconstruct(segments)).toBe('sig:router:swap:budget_cpu_limit');
  });

  it('collapses overlapping terms into one segment', () => {
    // A query of overlapping terms must not produce nested or split matches.
    const segments = highlightMatches('errorhandler', 'error handler');

    expect(matchedText(segments)).toEqual(['errorhandler']);
    expect(reconstruct(segments)).toBe('errorhandler');
  });

  it('merges adjacent matched terms into a single segment', () => {
    const segments = highlightMatches('abcdef', 'abc def');

    expect(matchedText(segments)).toEqual(['abcdef']);
    expect(reconstruct(segments)).toBe('abcdef');
  });

  it('marks a full-value match as a single matched segment', () => {
    const segments = highlightMatches('failed', 'failed');

    expect(segments).toEqual([{ text: 'failed', matched: true }]);
  });

  it('treats query terms literally, not as regular expressions', () => {
    // A metacharacter query must not match or throw.
    const segments = highlightMatches('a.c', 'a.c');

    expect(matchedText(segments)).toEqual(['a.c']);
  });

  it('does not treat query metacharacters as wildcards', () => {
    const segments = highlightMatches('abc', 'a.c');

    expect(matchedText(segments)).toEqual([]);
  });

  it('leaves value text untouched for HTML, so the renderer can escape it', () => {
    const value = '<script>alert(1)</script>';
    const segments = highlightMatches(value, 'alert');

    expect(reconstruct(segments)).toBe(value);
    expect(matchedText(segments)).toEqual(['alert']);
  });
});

describe('highlightedExcerpt', () => {
  it('highlights without truncating a value within the limit', () => {
    const segments = highlightedExcerpt('run-001', 'run', 120);

    expect(reconstruct(segments)).toBe('run-001');
    expect(matchedText(segments)).toEqual(['run']);
  });

  it('keeps a match near the end of a long value visible', () => {
    const value = `${'x'.repeat(400)}panic`;
    const segments = highlightedExcerpt(value, 'panic', 60);

    // Too close to the end to open on the match, so the window backs off just
    // far enough to keep it on screen. The match survives the cut.
    expect(matchedText(segments)).toEqual(['panic']);
    expect(segments[0]).toEqual({ text: '…', matched: false });
    expect(reconstruct(segments).replace('…', '')).toBe(`${'x'.repeat(55)}panic`);
  });

  it('opens the window on the match when there is room after it', () => {
    const value = `${'x'.repeat(400)}panic${'y'.repeat(400)}`;
    const segments = highlightedExcerpt(value, 'panic', 60);

    // Starts on the match rather than on 400 characters of filler. The leading
    // ellipsis still marks that earlier text was skipped.
    expect(segments[0]).toEqual({ text: '…', matched: false });
    expect(segments[1]).toEqual({ text: 'panic', matched: true });
  });

  it('omits the leading ellipsis when the window starts at the value start', () => {
    const value = `panic${'y'.repeat(400)}`;
    const segments = highlightedExcerpt(value, 'panic', 60);

    expect(segments[0]).toEqual({ text: 'panic', matched: true });
    expect(segments.some((segment) => segment.text === '…')).toBe(false);
  });

  it('truncates a long value with no match and marks nothing', () => {
    const value = 'y'.repeat(400);
    const segments = highlightedExcerpt(value, 'panic', 60);

    expect(matchedText(segments)).toEqual([]);
    expect(reconstruct(segments)).toBe(`${'y'.repeat(60)}…`);
  });

  it('never drops characters when trimming around the first match', () => {
    const value = `${'a'.repeat(50)}needle${'b'.repeat(200)}`;
    const segments = highlightedExcerpt(value, 'needle', 40);

    expect(matchedText(segments)).toEqual(['needle']);
    // Everything shown is a real slice of the value: no duplicated or
    // reordered characters from an off-by-one window.
    const shown = reconstruct(segments).replace('…', '');
    expect(value).toContain(shown);
  });

  it('returns the value unchanged at the boundary length', () => {
    const value = 'abcdefghij';
    const segments = highlightedExcerpt(value, 'cde', value.length);

    expect(reconstruct(segments)).toBe(value);
    expect(matchedText(segments)).toEqual(['cde']);
  });
});
