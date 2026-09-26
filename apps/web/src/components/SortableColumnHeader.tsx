'use client';

import React from 'react';
import {
  getSortIndicator,
  type SortState,
} from '../app/run-history-sort-utils';

export interface SortableColumnHeaderProps<TField extends string = string> {
  /** Column field identifier */
  field: TField;
  /** Header label text or node */
  label?: React.ReactNode;
  /** Header children if passed as children */
  children?: React.ReactNode;
  /** Active sort state */
  sortState?: SortState<TField> | null;
  /** Callback invoked when sort is triggered via pointer click or keyboard (Enter/Space) */
  onSort?: (field: TField) => void;
  /** Additional CSS class names for the <th> element */
  className?: string;
  /** Additional CSS class names for the inner <button> element */
  buttonClassName?: string;
  /** Alignment of column content ('left' | 'right' | 'center') */
  align?: 'left' | 'right' | 'center';
}

/**
 * SortableColumnHeader
 *
 * Renders a compliant, accessible sortable table header (WCAG 2.1.1 & 4.1.2):
 * - Real <button> element inside <th scope="col">
 * - aria-sort attribute ('ascending' | 'descending' | 'none') synchronized with sortState
 * - Visible focus ring for keyboard navigation
 * - State-tied direction glyph (↑ / ↓ / ↕)
 * - Accessible name with state context and next toggle action
 */
export function SortableColumnHeader<TField extends string = string>({
  field,
  label,
  children,
  sortState,
  onSort,
  className = '',
  buttonClassName = '',
  align = 'left',
}: SortableColumnHeaderProps<TField>) {
  const content = label ?? children ?? field;
  const indicator = getSortIndicator(field, sortState);
  const labelText = typeof content === 'string' ? content : field;

  const nextActionDescription =
    indicator.ariaSort === 'ascending'
      ? 'sort descending'
      : indicator.ariaSort === 'descending'
      ? 'remove sorting'
      : 'sort ascending';

  const alignClasses =
    align === 'right'
      ? 'justify-end ml-auto text-right'
      : align === 'center'
      ? 'justify-center mx-auto text-center'
      : 'justify-start text-left';

  return (
    <th
      scope="col"
      aria-sort={indicator.ariaSort}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort?.(field)}
        className={`group/sort inline-flex items-center gap-1.5 font-semibold text-inherit rounded px-1 -mx-1 transition-colors
          hover:text-blue-600 dark:hover:text-blue-400
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
          ${alignClasses} ${buttonClassName}`}
        aria-label={`${labelText}, ${indicator.ariaSort}. Activate to ${nextActionDescription}`}
      >
        <span>{content}</span>
        <span
          aria-hidden="true"
          className={`inline-block text-xs font-mono select-none transition-colors ${
            indicator.active
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-zinc-400 dark:text-zinc-500 opacity-60 group-hover/sort:opacity-100'
          }`}
        >
          {indicator.symbol}
        </span>
      </button>
    </th>
  );
}

export default SortableColumnHeader;
