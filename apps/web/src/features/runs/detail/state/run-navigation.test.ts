import { describe, expect, it } from 'vitest';
import { findRunNeighbors } from './run-navigation';

const runs = [
  { id: 'newest', queuedAt: '2026-01-03T00:00:00Z' },
  { id: 'middle', queuedAt: '2026-01-02T00:00:00Z' },
  { id: 'oldest', queuedAt: '2026-01-01T00:00:00Z' },
];

describe('run neighbors', () => {
  it('finds adjacent runs in newest-first order', () => {
    expect(findRunNeighbors(runs, 'middle')).toEqual({
      previous: 'newest',
      next: 'oldest',
      position: 2,
      total: 3,
    });
  });

  it('reports null at the boundaries', () => {
    expect(findRunNeighbors(runs, 'newest').previous).toBeNull();
    expect(findRunNeighbors(runs, 'oldest').next).toBeNull();
  });

  it('handles unknown run ids and invalid timestamps', () => {
    expect(findRunNeighbors(runs, 'missing').position).toBe(0);
    expect(findRunNeighbors([{ id: 'a', queuedAt: 'invalid' }, { id: 'b' }], 'b').total).toBe(2);
  });
});
