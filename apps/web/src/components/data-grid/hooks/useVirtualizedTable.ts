'use client';

/**
 * Main hook for the virtualized data grid (#2190).
 *
 * Integrates row/column virtualizers, manages sort state, and handles
 * scroll synchronization with rAF throttling. Returns the virtual window
 * data needed for rendering.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ColumnDef, SortState } from '../types';
import { createRowVirtualizer, type RowVirtualizer } from '../virtualizer/rowVirtualizer';
import { createColumnVirtualizer, type ColumnVirtualizer } from '../virtualizer/columnVirtualizer';
import { createViewportSync, type ViewportSync as _ViewportSync } from '../virtualizer/viewportSync';
import { DEFAULT_ROW_HEIGHT, DEFAULT_OVERSCAN, DEFAULT_VIEWPORT_HEIGHT } from '../constants';

export interface UseVirtualizedTableOptions<T> {
  columns: ColumnDef<T>[];
  data: T[];
  viewportHeight?: number;
  rowHeight?: number;
  overscan?: number;
  frozenColumnCount?: number;
  scrollResetKey?: string;
}

export interface UseVirtualizedTableResult<_T> {
  virtualRows: { firstIndex: number; lastIndex: number; count: number; totalHeight: number; offsetTop: number };
  virtualColumns: { visibleColumns: string[]; firstIndex: number; lastIndex: number; totalWidth: number };
  viewportRef: React.RefObject<HTMLDivElement | null>;
  scrollTop: number;
  scrollLeft: number;
  viewportSize: { width: number; height: number };
  sortState: SortState | null;
  setSortState: (state: SortState | null) => void;
  handleSort: (field: string) => void;
  rowVirtualizer: RowVirtualizer;
  columnVirtualizer: ColumnVirtualizer;
}

export function useVirtualizedTable<T>({
  columns,
  data,
  viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  frozenColumnCount = 0,
  scrollResetKey,
}: UseVirtualizedTableOptions<T>): UseVirtualizedTableResult<T> {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: viewportHeight });
  const [sortState, setSortState] = useState<SortState | null>(null);

  const rowVirtualizer = useMemo(
    () => createRowVirtualizer({ rowHeight, overscan }),
    [rowHeight, overscan],
  );

  const columnVirtualizer = useMemo(
    () => createColumnVirtualizer(),
    [],
  );

  const viewportSync = useMemo(
    () =>
      createViewportSync({
        onScroll: (st, sl) => {
          setScrollTop(st);
          setScrollLeft(sl);
        },
        onResize: (w, h) => setViewportSize({ width: w, height: h }),
      }),
    [],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    viewportSync.attach(el);
    return () => viewportSync.detach();
  }, [viewportSync]);

  // Reset scroll when the view identity changes.
  useEffect(() => {
    if (scrollResetKey === undefined) return;
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    setScrollTop(0);
    setScrollLeft(0);
  }, [scrollResetKey]);

  const virtualRows = useMemo(
    () => rowVirtualizer.measure(scrollTop, viewportHeight, data.length),
    [rowVirtualizer, scrollTop, viewportHeight, data.length],
  );

  const virtualColumns = useMemo(
    () => columnVirtualizer.measure(scrollLeft, viewportSize.width, columns as unknown as ColumnDef[], frozenColumnCount),
    [columnVirtualizer, scrollLeft, viewportSize.width, columns, frozenColumnCount],
  );

  const handleSort = useCallback(
    (field: string) => {
      setSortState((prev) => {
        if (prev?.field === field) {
          const next: SortState = {
            field,
            direction: prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? 'none' : 'asc',
          };
          return next.direction === 'none' ? null : next;
        }
        return { field, direction: 'asc' };
      });
    },
    [],
  );

  return {
    virtualRows,
    virtualColumns,
    viewportRef,
    scrollTop,
    scrollLeft,
    viewportSize,
    sortState,
    setSortState,
    handleSort,
    rowVirtualizer,
    columnVirtualizer,
  };
}
