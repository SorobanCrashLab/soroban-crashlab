'use client';

/**
 * Generic memoized cell renderer for the data grid (#2190).
 *
 * Renders a cell value based on its column definition. Memoized to
 * prevent unnecessary re-renders during scroll.
 */

import { memo } from 'react';
import type { ColumnDef } from '../types';

interface CellRendererProps<T = unknown> {
  column: ColumnDef<T>;
  row: T;
}

function CellRendererBase<T>({ column, row }: CellRendererProps<T>) {
  const value = column.accessor(row);

  if (column.cellRenderer) {
    return <>{column.cellRenderer(value, row)}</>;
  }

  const alignClass =
    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={`px-6 py-2 text-sm text-zinc-600 dark:text-zinc-400 ${alignClass}`}>
      {typeof value === 'number' ? value.toLocaleString() : String(value)}
    </div>
  );
}

export const CellRenderer = memo(CellRendererBase) as typeof CellRendererBase;
