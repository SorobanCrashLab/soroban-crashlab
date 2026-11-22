/**
 * Keyboard navigation helpers for accessible data tables.
 *
 * Implements the roving-tabindex pattern: arrow keys move focus between rows,
 * Home/End jump to the first/last row, and Enter/Space activate the row.
 *
 * Issue: #933 - [a11y] Add keyboard navigation for data tables
 */

export type DataTableNavAction =
  | { type: "activate" }
  | { type: "focus"; index: number }
  | { type: "none" };

/** Keys that move focus to another row instead of activating the current row. */
export const DATA_TABLE_NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/** Keys that activate the focused row (open details, follow primary action). */
export const DATA_TABLE_ACTIVATION_KEYS = new Set(["Enter", " "]);

/** Default number of rows a PageUp/PageDown press travels. */
export const DATA_TABLE_DEFAULT_PAGE_SIZE = 10;

/**
 * Resolve the keyboard action for a focused table row.
 * Returns `none` for unhandled keys or empty tables.
 *
 * `pageSize` controls how many rows PageUp/PageDown traverse (default 10). For
 * a virtualized grid the value should be the number of rows the viewport can
 * actually show, so a page press roughly scrolls one screen.
 */
export function resolveDataTableRowKeyDown(
  key: string,
  currentIndex: number,
  rowCount: number,
  pageSize: number = DATA_TABLE_DEFAULT_PAGE_SIZE,
): DataTableNavAction {
  if (rowCount <= 0) {
    return { type: "none" };
  }

  if (DATA_TABLE_ACTIVATION_KEYS.has(key)) {
    return { type: "activate" };
  }

  if (key === "ArrowDown") {
    return {
      type: "focus",
      index: Math.min(currentIndex + 1, rowCount - 1),
    };
  }

  if (key === "ArrowUp") {
    return {
      type: "focus",
      index: Math.max(currentIndex - 1, 0),
    };
  }

  if (key === "PageDown") {
    const step = Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : DATA_TABLE_DEFAULT_PAGE_SIZE;
    return {
      type: "focus",
      index: Math.min(currentIndex + step, rowCount - 1),
    };
  }

  if (key === "PageUp") {
    const step = Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : DATA_TABLE_DEFAULT_PAGE_SIZE;
    return {
      type: "focus",
      index: Math.max(currentIndex - step, 0),
    };
  }

  if (key === "Home") {
    return { type: "focus", index: 0 };
  }

  if (key === "End") {
    return { type: "focus", index: rowCount - 1 };
  }

  return { type: "none" };
}

/**
 * Roving tabindex: only the focused row (or the first row when none is focused)
 * participates in the tab order.
 */
export function getDataTableRowTabIndex(
  rowIndex: number,
  focusedIndex: number | null,
  rowCount: number,
): number {
  if (rowCount <= 0) {
    return -1;
  }

  const activeIndex = focusedIndex ?? 0;
  return rowIndex === activeIndex ? 0 : -1;
}
