'use client';

import React from 'react';

export interface StaleBadgeProps {
  /** Custom label. Defaults to "Stale data". */
  label?: string;
  /** Custom tooltip. */
  title?: string;
  className?: string;
}

/**
 * Small inline badge shown alongside list/detail views when data is being
 * revalidated in the background (#1886).
 *
 * Renders a subtle pulsing indicator so users know the displayed data is
 * from a previous fetch while a background refresh is in progress.
 */
export function StaleBadge({ label = 'Refreshing…', title, className = '' }: StaleBadgeProps) {
  return (
    <span
      aria-live="polite"
      title={title ?? 'Data is being refreshed in the background'}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 select-none ${className}`}
    >
      {/* Pulsing dot */}
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
      />
      {label}
    </span>
  );
}
