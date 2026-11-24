/**
 * Dependency-free windowing calculator for the run workspace log/crash tables
 * (#2257). It keeps 10k+ rows scrollable without mounting the whole collection.
 */

export interface VirtualWindowInput {
  itemCount: number;
  itemHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

const DEFAULT_OVERSCAN = 4;

export function computeVirtualWindow({
  itemCount,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan = DEFAULT_OVERSCAN,
}: VirtualWindowInput): VirtualWindow {
  if (itemCount <= 0 || itemHeight <= 0 || viewportHeight <= 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
  }

  const safeScroll = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const overscanCount = Math.max(0, Math.floor(overscan));
  const visibleCount = Math.ceil(viewportHeight / itemHeight);
  const firstVisible = Math.floor(safeScroll / itemHeight);
  const startIndex = Math.max(0, firstVisible - overscanCount);
  const endIndex = Math.min(itemCount, firstVisible + visibleCount + overscanCount + 1);

  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * itemHeight,
    paddingBottom: Math.max(0, (itemCount - endIndex) * itemHeight),
  };
}

/** Clamp a scroll offset into the legal range for a virtualized list. */
export function clampScrollTop(scrollTop: number, itemCount: number, itemHeight: number, viewportHeight: number): number {
  const max = Math.max(0, itemCount * itemHeight - viewportHeight);
  return Math.min(Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0), max);
}
