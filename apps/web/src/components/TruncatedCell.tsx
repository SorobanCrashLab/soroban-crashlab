'use client';

import type { ReactNode } from 'react';

interface TruncatedCellProps {
  /** The full content to display in the cell and tooltip */
  children: ReactNode;
  /** Optional additional CSS classes for the cell wrapper */
  className?: string;
  /** Optional max-width override for the tooltip (defaults to 360px) */
  tooltipMaxWidth?: string;
}

/**
 * TruncatedCell — renders content with text truncation and reveals the full
 * content in a Navy Professional-styled tooltip on hover.
 *
 * The tooltip:
 *  - Appears above the cell on hover
 *  - Adapts to light/dark mode via CSS custom properties
 *  - Has a subtle entrance animation (fade + slide)
 *  - Respects prefers-reduced-motion
 *  - Falls back to the native `title` attribute for keyboard/AT users
 */
export default function TruncatedCell({
  children,
  className = '',
  tooltipMaxWidth = '360px',
}: TruncatedCellProps) {
  const contentStr = typeof children === 'string' ? children : typeof children === 'number' ? String(children) : '';

  return (
    <span
      className={`group relative inline-block max-w-full ${className}`}
      title={contentStr}
    >
      {/* ── Truncated content ──────────────────────────────────────────────── */}
      <span className="block truncate">
        {children}
      </span>

      {/* ── Hover tooltip ──────────────────────────────────────────────────── */}
      <span
        className="
          pointer-events-none absolute z-50
          bottom-full left-1/2 -translate-x-1/2
          mb-1.5 px-3 py-1.5
          text-xs leading-snug
          rounded-lg shadow-lg
          whitespace-normal break-words

          /* Navy Professional surface colors */
          bg-white dark:bg-zinc-800
          text-zinc-900 dark:text-zinc-100
          border border-zinc-200 dark:border-zinc-700

          /* Hidden by default, revealed on hover */
          opacity-0 translate-y-1
          group-hover:opacity-100 group-hover:translate-y-0
          group-focus:opacity-100 group-focus:translate-y-0

          /* Entrance animation */
          transition-all duration-150 ease-out

          /* Prevent tooltip from being cut off by overflow parents */
          motion-reduce:transition-none
        "
        style={{ maxWidth: tooltipMaxWidth }}
        aria-hidden="true"
      >
        {children}
        {/* ── Arrow / caret ────────────────────────────────────────────────── */}
        <span
          className="
            absolute top-full left-1/2 -translate-x-1/2
            border-[5px] border-transparent
            border-t-white dark:border-t-zinc-800
          "
          aria-hidden="true"
        />
      </span>
    </span>
  );
}
