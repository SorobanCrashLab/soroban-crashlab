/**
 * Pure helpers for the run history table's sort indicators.
 *
 * Fixes #838: the sort arrow must clearly reflect *which* column is active and
 * in *which* direction. Centralising the logic here removes the duplicated
 * `sortField === "x" && (sortOrder === "asc" ? "↑" : "↓")` expressions that
 * were repeated per column and makes the behaviour unit-testable.
 */

export type SortOrder = 'asc' | 'desc';

export interface SortState<TField extends string = string> {
  field: TField;
  order: SortOrder;
}

export interface SortIndicator {
  /** Whether this column is the one currently being sorted on. */
  active: boolean;
  /** Glyph to render: up/down arrow for the active column, a neutral ↕ otherwise. */
  symbol: string;
  /** Value for the `aria-sort` attribute on the `<th>`. */
  ariaSort: 'ascending' | 'descending' | 'none';
}

const ARROW_UP = '↑';
const ARROW_DOWN = '↓';
const ARROW_NEUTRAL = '↕';

/**
 * Describe how a given column should render its sort affordance relative to the
 * currently active sort state.
 */
export function getSortIndicator<TField extends string>(
  field: TField,
  active: SortState<TField>,
): SortIndicator {
  if (field !== active.field) {
    // Inactive but sortable column: show a dimmed neutral glyph as an affordance.
    return { active: false, symbol: ARROW_NEUTRAL, ariaSort: 'none' };
  }
  return active.order === 'asc'
    ? { active: true, symbol: ARROW_UP, ariaSort: 'ascending' }
    : { active: true, symbol: ARROW_DOWN, ariaSort: 'descending' };
}

/**
 * Compute the next sort state when a header is clicked: toggle direction when
 * the same column is clicked, otherwise switch to the new column (defaulting to
 * descending, matching the table's initial order).
 */
export function getNextSortState<TField extends string>(
  current: SortState<TField>,
  field: TField,
): SortState<TField> {
  if (current.field === field) {
    return { field, order: current.order === 'asc' ? 'desc' : 'asc' };
  }
  return { field, order: 'desc' };
}
