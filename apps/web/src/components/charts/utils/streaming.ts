import { useCallback, useState } from 'react';
import type { ChartPoint } from '../types';

export function useStreamingSeries<TPoint extends ChartPoint>(
  initial: readonly TPoint[] = [],
  maxPoints = 100_000,
) {
  if (!Number.isInteger(maxPoints) || maxPoints < 1) {
    throw new RangeError('maxPoints must be a positive integer');
  }
  const [points, setPoints] = useState<readonly TPoint[]>(initial);
  const append = useCallback((next: readonly TPoint[]) => {
    setPoints((current) => [...current, ...next].slice(-maxPoints));
  }, [maxPoints]);
  const replace = useCallback((next: readonly TPoint[]) => {
    setPoints(next.slice(-maxPoints));
  }, [maxPoints]);
  return { points, append, replace };
}
