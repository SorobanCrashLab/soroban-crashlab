/**
 * Pure helpers for table sort indicators and state transitions.
 *
 * Fixes #838 and implements WCAG 2.1.1 (keyboard) and 4.1.2 (name/role/value)
 * accessible sortable table headers with aria-sort semantics.
 */

export type SortOrder = 'asc' | 'desc' | 'none';

export interface SortState<TField extends string = string> {
  field: TField | null;
  order: SortOrder;
}

export interface SortIndicator {
  /** Whether this column is the one currently being sorted on. */
  active: boolean;
  /** Glyph to render: up/down arrow for the active column, a neutral ↕ otherwise. */
  symbol: string;
  /** Value for the `aria-sort` attribute on the `<th scope="col">`. */
  ariaSort: 'ascending' | 'descending' | 'none';
}

export const ARROW_UP = '↑';
export const ARROW_DOWN = '↓';
export const ARROW_NEUTRAL = '↕';

/**
 * Describe how a given column should render its sort affordance relative to the
 * currently active sort state.
 */
export function getSortIndicator<TField extends string>(
  field: TField,
  active?: SortState<TField> | null,
): SortIndicator {
  if (!active || !active.field || active.field !== field || active.order === 'none') {
    // Inactive or un-sorted column: show a dimmed neutral glyph as an affordance.
    return { active: false, symbol: ARROW_NEUTRAL, ariaSort: 'none' };
  }
  if (active.order === 'asc') {
    return { active: true, symbol: ARROW_UP, ariaSort: 'ascending' };
  }
  if (active.order === 'desc') {
    return { active: true, symbol: ARROW_DOWN, ariaSort: 'descending' };
  }
  return { active: false, symbol: ARROW_NEUTRAL, ariaSort: 'none' };
}

/**
 * Compute the next sort state when a header is activated via pointer or keyboard.
 * Implements toggle-cycle semantics (asc → desc → none) consistently across tables.
 * When switching to a new column, sorting starts at 'asc'.
 */
export function getNextSortState<TField extends string>(
  current: SortState<TField> | null | undefined,
  field: TField,
): SortState<TField> {
  if (!current || !current.field || current.field !== field || current.order === 'none') {
    return { field, order: 'asc' };
  }
  if (current.order === 'asc') {
    return { field, order: 'desc' };
  }
  if (current.order === 'desc') {
    return { field: null, order: 'none' };
  }
  return { field, order: 'asc' };
}

