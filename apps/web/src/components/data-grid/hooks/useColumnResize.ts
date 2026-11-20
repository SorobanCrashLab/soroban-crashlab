'use client';

/**
 * Hook for column resize with persistence (#2190).
 *
 * Persists column widths to localStorage so users get consistent
 * column sizing across sessions. Handles mouse-drag resize.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { COLUMN_RESIZE_STORAGE_KEY } from '../constants';

interface ColumnWidths {
  [columnId: string]: number;
}

export function useColumnResize(initialColumns: { id: string; width?: number }[]) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});
  const resizingColumn = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Load persisted widths on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLUMN_RESIZE_STORAGE_KEY);
      if (stored) {
        setColumnWidths(JSON.parse(stored) as ColumnWidths);
      }
    } catch {
      // localStorage may be unavailable.
    }
  }, []);

  // Initialize default widths for columns without persisted values.
  useEffect(() => {
    setColumnWidths((prev) => {
      const next = { ...prev };
      for (const col of initialColumns) {
        if (!(col.id in next) && col.width) {
          next[col.id] = col.width;
        }
      }
      return next;
    });
  }, [initialColumns]);

  const resizeColumn = useCallback(
    (columnId: string, newWidth: number) => {
      setColumnWidths((prev) => {
        const next = { ...prev, [columnId]: Math.max(50, newWidth) };
        try {
          localStorage.setItem(COLUMN_RESIZE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage may be full or unavailable.
        }
        return next;
      });
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, columnId: string, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingColumn.current = columnId;
      startX.current = e.clientX;
      startWidth.current = currentWidth;
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!resizingColumn.current) return;
      const delta = e.clientX - startX.current;
      resizeColumn(resizingColumn.current, startWidth.current + delta);
    },
    [resizeColumn],
  );

  const handleMouseUp = useCallback(() => {
    resizingColumn.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const resetWidths = useCallback(() => {
    const defaults: ColumnWidths = {};
    for (const col of initialColumns) {
      if (col.width) defaults[col.id] = col.width;
    }
    setColumnWidths(defaults);
    try {
      localStorage.setItem(COLUMN_RESIZE_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // Ignore.
    }
  }, [initialColumns]);

  const persisted = Object.keys(columnWidths).length > 0;

  return { columnWidths, resizeColumn, resetWidths, persisted, handleMouseDown };
}
