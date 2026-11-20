/**
 * Row virtualization logic for the data grid (#2190).
 *
 * Enhanced version of the existing computeVirtualWindow from
 * apps/web/src/app/runs-table/virtual-window.ts, packaged as a class
 * for reuse across grid instances.
 */

import type { VirtualWindowResult } from '../types';
import { DEFAULT_ROW_HEIGHT, DEFAULT_OVERSCAN } from '../constants';

export interface RowVirtualizerConfig {
  rowHeight: number;
  overscan: number;
}

export class RowVirtualizer {
  private rowHeight: number;
  private overscan: number;

  constructor(config: RowVirtualizerConfig) {
    this.rowHeight = config.rowHeight || DEFAULT_ROW_HEIGHT;
    this.overscan = config.overscan ?? DEFAULT_OVERSCAN;
  }

  measure(
    scrollTop: number,
    viewportHeight: number,
    rowCount: number,
  ): VirtualWindowResult {
    if (rowCount <= 0 || this.rowHeight <= 0) {
      return { firstIndex: 0, lastIndex: -1, count: 0, totalHeight: 0, offsetTop: 0 };
    }

    const safeScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
    const safeViewport = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);

    const firstVisible = Math.floor(safeScrollTop / this.rowHeight);
    const lastVisible = Math.ceil((safeScrollTop + safeViewport) / this.rowHeight);

    const firstIndex = Math.max(0, Math.min(firstVisible - this.overscan, rowCount - 1));
    const lastIndex = Math.min(lastVisible + this.overscan, rowCount - 1);

    return {
      firstIndex,
      lastIndex,
      count: lastIndex >= firstIndex ? lastIndex - firstIndex + 1 : 0,
      totalHeight: rowCount * this.rowHeight,
      offsetTop: firstIndex * this.rowHeight,
    };
  }

  getRowHeight(): number {
    return this.rowHeight;
  }
}

export function createRowVirtualizer(config?: Partial<RowVirtualizerConfig>): RowVirtualizer {
  return new RowVirtualizer({
    rowHeight: config?.rowHeight ?? DEFAULT_ROW_HEIGHT,
    overscan: config?.overscan ?? DEFAULT_OVERSCAN,
  });
}
