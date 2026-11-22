import { describe, it, expect } from 'vitest';
import { computeNextRecents } from './recents';

describe('computeNextRecents', () => {
  it('adds a new id to the front of an empty list', () => {
    expect(computeNextRecents([], 'a')).toEqual(['a']);
  });

  it('moves a re-run id to the front instead of duplicating it', () => {
    expect(computeNextRecents(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps the list at the provided max, dropping the oldest entries', () => {
    const current = ['a', 'b', 'c'];
    expect(computeNextRecents(current, 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  it('defaults the cap to MAX_RECENT_COMMANDS (10)', () => {
    const current = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    const next = computeNextRecents(current, 'new');
    expect(next).toHaveLength(10);
    expect(next[0]).toBe('new');
    expect(next).not.toContain('id-9');
  });
});
