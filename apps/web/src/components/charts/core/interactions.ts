import type { ChartPoint, ChartRange } from '../types';

const SYNC_EVENT = 'crashlab:chart-sync';

export interface SyncedCursor {
  group: string;
  x: ChartPoint['x'];
  sourceId: string;
}

export function publishSyncedCursor(cursor: SyncedCursor): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: cursor }));
}

export function subscribeSyncedCursor(group: string, sourceId: string, listener: (x: ChartPoint['x']) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => {
    const cursor = (event as CustomEvent<SyncedCursor>).detail;
    if (cursor.group === group && cursor.sourceId !== sourceId) listener(cursor.x);
  };
  window.addEventListener(SYNC_EVENT, handle);
  return () => window.removeEventListener(SYNC_EVENT, handle);
}

export function getSelectedRange<TPoint extends ChartPoint>(
  points: readonly TPoint[],
  startIndex: number,
  endIndex: number,
): ChartRange | null {
  if (points.length === 0) return null;
  const start = Math.max(0, Math.min(points.length - 1, Math.min(startIndex, endIndex)));
  const end = Math.max(0, Math.min(points.length - 1, Math.max(startIndex, endIndex)));
  return { start: points[start], end: points[end] };
}
