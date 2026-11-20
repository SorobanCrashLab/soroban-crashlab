/**
 * Column virtualization logic for the data grid (#2190).
 *
 * Handles horizontal virtualization so that only visible columns (plus
 * overscan) are rendered. Frozen columns are always rendered regardless
 * of scroll position.
 */

import type { ColumnDef, ColumnVirtualWindowResult } from '../types';
import { DEFAULT_COLUMN_OVERSCAN } from '../constants';

export interface ColumnVirtualizerConfig {
  overscan: number;
  defaultColumnWidth: number;
}

export class ColumnVirtualizer {
  private overscan: number;
  private defaultColumnWidth: number;
  private columnWidths: Map<string, number> = new Map();

  constructor(config?: Partial<ColumnVirtualizerConfig>) {
    this.overscan = config?.overscan ?? DEFAULT_COLUMN_OVERSCAN;
    this.defaultColumnWidth = config?.defaultColumnWidth ?? 150;
  }

  setColumnWidth(columnId: string, width: number): void {
    this.columnWidths.set(columnId, Math.max(50, width));
  }

  getColumnWidth(columnId: string): number {
    return this.columnWidths.get(columnId) ?? this.defaultColumnWidth;
  }

  measure(
    scrollLeft: number,
    viewportWidth: number,
    columns: ColumnDef[],
    frozenColumnCount: number = 0,
  ): ColumnVirtualWindowResult {
    if (columns.length === 0) {
      return { firstIndex: 0, lastIndex: -1, visibleColumns: [], totalWidth: 0 };
    }

    const frozenColumns = columns.slice(0, frozenColumnCount);
    const scrollableColumns = columns.slice(frozenColumnCount);

    const frozenWidth = frozenColumns.reduce(
      (sum, col) => sum + this.getColumnWidth(col.id),
      0,
    );

    const effectiveViewportWidth = Math.max(0, viewportWidth - frozenWidth);
    const safeScrollLeft = Math.max(0, scrollLeft);

    let cumulativeWidth = 0;
    let firstIndex = 0;
    let lastIndex = scrollableColumns.length - 1;

    for (let i = 0; i < scrollableColumns.length; i++) {
      const colWidth = this.getColumnWidth(scrollableColumns[i].id);
      if (cumulativeWidth + colWidth >= safeScrollLeft) {
        firstIndex = Math.max(0, i - this.overscan);
        break;
      }
      cumulativeWidth += colWidth;
    }

    cumulativeWidth = 0;
    for (let i = 0; i < scrollableColumns.length; i++) {
      const colWidth = this.getColumnWidth(scrollableColumns[i].id);
      cumulativeWidth += colWidth;
      if (cumulativeWidth >= safeScrollLeft + effectiveViewportWidth) {
        lastIndex = Math.min(scrollableColumns.length - 1, i + this.overscan);
        break;
      }
    }

    const visibleScrollable = scrollableColumns
      .slice(firstIndex, lastIndex + 1)
      .map((col) => col.id);

    const visibleColumns = [
      ...frozenColumns.map((col) => col.id),
      ...visibleScrollable,
    ];

    const totalWidth = columns.reduce(
      (sum, col) => sum + this.getColumnWidth(col.id),
      0,
    );

    return { firstIndex: firstIndex + frozenColumnCount, lastIndex: lastIndex + frozenColumnCount, visibleColumns, totalWidth };
  }
}

export function createColumnVirtualizer(config?: Partial<ColumnVirtualizerConfig>): ColumnVirtualizer {
  return new ColumnVirtualizer(config);
}
