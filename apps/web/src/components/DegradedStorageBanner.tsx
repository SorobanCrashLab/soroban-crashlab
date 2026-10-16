'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface DegradedStorageBannerProps {
  /**
   * Reason text shown in the banner. Keep short; link to detail via statusHref.
   * Defaults to a generic degraded-storage message.
   */
  message?: string;
  /**
   * Optional href to a status detail page (e.g. /api/health or a status UI route).
   * When provided, a "View details" link is rendered.
   */
  statusHref?: string;
  /** Called when the user dismisses the banner. */
  onDismiss?: () => void;
  /**
   * Severity level.
   * - 'error'   → red; storage corruption blocking operations
   * - 'warning' → amber; storage degraded but operational (default)
   */
  variant?: 'error' | 'warning';
  className?: string;
}

const VARIANT_STYLES = {
  error: {
    wrapper:
      'bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800',
    icon: 'text-red-500 dark:text-red-400',
    text: 'text-red-800 dark:text-red-200',
    link: 'text-red-700 dark:text-red-300 underline hover:no-underline',
    dismiss: 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200',
  },
  warning: {
    wrapper:
      'bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800',
    icon: 'text-amber-500 dark:text-amber-400',
    text: 'text-amber-800 dark:text-amber-200',
    link: 'text-amber-700 dark:text-amber-300 underline hover:no-underline',
    dismiss: 'text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200',
  },
} as const;

/**
 * Global top-of-page banner surfacing storage degradation or corruption (#1885).
 *
 * Mount this above the main layout content when the health API signals
 * `storage` or `snapshot` dependencies as `degraded` or `unavailable`.
 * The banner is dismissible per session; persistent display fatigue is the
 * caller's responsibility (e.g. re-show when the signal reappears).
 */
export function DegradedStorageBanner({
  message,
  statusHref,
  onDismiss,
  variant = 'warning',
  className = '',
}: DegradedStorageBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const styles = VARIANT_STYLES[variant];
  const defaultMsg =
    variant === 'error'
      ? 'Storage corruption detected. Some operations may be blocked until the issue is resolved.'
      : 'Storage is currently degraded. Data may be incomplete or slower to load.';
  const displayMsg = message ?? defaultMsg;

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm ${styles.wrapper} ${className}`}
    >
      {/* Icon */}
      <span aria-hidden="true" className={`shrink-0 text-base ${styles.icon}`}>
        {variant === 'error' ? '✕' : '⚠'}
      </span>

      {/* Message */}
      <span className={`flex-1 ${styles.text}`}>
        {displayMsg}
        {statusHref && (
          <>
            {' '}
            <Link href={statusHref} className={styles.link}>
              View details
            </Link>
          </>
        )}
      </span>

      {/* Dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss storage warning"
        className={`shrink-0 p-1 rounded transition-opacity opacity-70 hover:opacity-100 ${styles.dismiss}`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
