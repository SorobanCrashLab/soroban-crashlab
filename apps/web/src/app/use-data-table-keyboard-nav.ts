"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type RefCallback,
} from "react";
import {
  getDataTableRowTabIndex,
  resolveDataTableRowKeyDown,
} from "./data-table-keyboard-nav-utils";

export interface DataTableRowKeyboardProps {
  tabIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  ref: RefCallback<HTMLElement>;
}

interface UseDataTableKeyboardNavOptions {
  rowCount: number;
  onActivate?: (index: number) => void;
  onFocusRow?: (index: number) => void;
  enabled?: boolean;
  /**
   * Rows traversed per PageUp/PageDown press (#1875). Defaults to 10; a
   * virtualized grid should pass the number of rows its viewport shows.
   */
  pageSize?: number;
}

/**
 * Hook that wires roving-tabindex keyboard navigation into table rows.
 * Spread the returned props onto each focusable `<tr>` (or row container).
 */
export function useDataTableKeyboardNav({
  rowCount,
  onActivate,
  onFocusRow,
  enabled = true,
  pageSize,
}: UseDataTableKeyboardNavOptions) {
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const focusRow = useCallback(
    (index: number) => {
      if (!enabled || index < 0 || index >= rowCount) {
        return;
      }

      onFocusRow?.(index);
      const attemptFocus = () => {
        const row = rowRefs.current.get(index);
        if (row) {
          row.focus();
          setFocusedIndex(index);
        }
      };
      attemptFocus();
      requestAnimationFrame(attemptFocus);
    },
    [enabled, onFocusRow, rowCount],
  );

  const getRowProps = useCallback(
    (index: number): DataTableRowKeyboardProps => {
      const setRef: RefCallback<HTMLElement> = (element) => {
        if (element) {
          rowRefs.current.set(index, element);
        } else {
          rowRefs.current.delete(index);
        }
      };

      return {
        tabIndex: enabled
          ? getDataTableRowTabIndex(index, focusedIndex, rowCount)
          : -1,
        onFocus: () => setFocusedIndex(index),
        ref: setRef,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (!enabled) {
            return;
          }

          const action = resolveDataTableRowKeyDown(
            event.key,
            index,
            rowCount,
            pageSize,
          );

          if (action.type === "activate") {
            event.preventDefault();
            onActivate?.(index);
            return;
          }

          if (action.type === "focus") {
            event.preventDefault();
            focusRow(action.index);
          }
        },
      };
    },
    [enabled, focusRow, focusedIndex, onActivate, pageSize, rowCount],
  );

  return { getRowProps, focusedIndex, focusRow };
}
