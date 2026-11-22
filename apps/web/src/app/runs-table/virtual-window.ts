/**
 * Windowed-rendering math for the virtualized runs table (#1875 / W5-H05).
 *
 * Kept free of React so the windowing contract can be unit tested with
 * synthetic 100k-row datasets and a bounded time budget.
 */

export interface VirtualWindowInput {
  /** Current vertical scroll offset of the viewport (px). */
  scrollTop: number;
  /** Height of the scroll viewport (px). */
  viewportHeight: number;
  /** Fixed height of every data row (px). */
  rowHeight: number;
  /** Total number of data rows in the (already filtered/sorted) list. */
  rowCount: number;
  /** Extra rows rendered above and below the visible slice. */
  overscan?: number;
}

export interface VirtualWindow {
  /** First rendered row index (inclusive). */
  firstIndex: number;
  /** Last rendered row index (inclusive). */
  lastIndex: number;
  /** Number of rows that will be mounted. */
  count: number;
  /** Height of the full un-virtualized list (px) — used by the spacer. */
  totalHeight: number;
  /** Y offset of the first rendered row (px). */
  offsetTop: number;
}

export const DEFAULT_OVERSCAN = 3;

/**
 * Upper bound on the rows that can be mounted for a viewport. Anything larger
 * means the math (or the caller) is wrong and would defeat virtualization.
 */
export function estimateMaxWindowRows(
  viewportHeight: number,
  rowHeight: number,
  overscan: number = DEFAULT_OVERSCAN,
): number {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(rowHeight) || rowHeight <= 0) {
    return 0;
  }
  const visibleRows = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
  return visibleRows + Math.max(0, Math.trunc(overscan)) * 2 + 1;
}

function clampIndex(index: number, max: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), Math.max(0, max));
}

/**
 * Compute the slice of rows that must be rendered for the current scroll
 * position. Guarantees a window size of at most
 * `estimateMaxWindowRows()` regardless of `rowCount` (100k+ rows included).
 */
export function computeVirtualWindow({
  scrollTop,
  viewportHeight,
  rowHeight,
  rowCount,
  overscan = DEFAULT_OVERSCAN,
}: VirtualWindowInput): VirtualWindow {
  if (rowCount <= 0 || rowHeight <= 0 || !Number.isFinite(rowHeight)) {
    return { firstIndex: 0, lastIndex: -1, count: 0, totalHeight: 0, offsetTop: 0 };
  }

  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const safeViewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const safeOverscan = Math.max(0, Math.trunc(overscan));

  const firstVisible = Math.floor(safeScrollTop / rowHeight);
  const lastVisible = Math.ceil((safeScrollTop + safeViewport) / rowHeight);

  const firstIndex = clampIndex(firstVisible - safeOverscan, rowCount - 1);
  const lastIndex = clampIndex(lastVisible + safeOverscan, rowCount - 1);

  return {
    firstIndex,
    lastIndex,
    count: lastIndex >= firstIndex ? lastIndex - firstIndex + 1 : 0,
    totalHeight: rowCount * rowHeight,
    offsetTop: firstIndex * rowHeight,
  };
}
