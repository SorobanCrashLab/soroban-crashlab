'use client';

import React, { useEffect, useState } from 'react';

export interface OfflineBannerProps {
  /** Override message. Defaults to a generic offline notice. */
  message?: string;
  className?: string;
}

/**
 * Non-blocking offline indicator (#1886).
 *
 * Listens to the browser's `online` / `offline` events and renders a sticky
 * banner when the user is offline. The banner disappears automatically once
 * connectivity is restored. No action is required from the user.
 *
 * SSR-safe: navigator.onLine is not accessed during server rendering; the
 * banner is hidden by default and only shown after mount if the browser is
 * offline.
 */
export function OfflineBanner({ message, className = '' }: OfflineBannerProps) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Read initial state after mount (browser-only).
    setOffline(!navigator.onLine);

    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline) return null;

  const displayMessage =
    message ?? "You're offline. Data shown may be stale — changes will sync when your connection is restored.";

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm bg-zinc-800 dark:bg-zinc-900 border-b border-zinc-700 dark:border-zinc-800 text-zinc-100 ${className}`}
    >
      {/* Offline icon */}
      <svg
        className="shrink-0 w-4 h-4 text-zinc-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M3 3l18 18"
        />
      </svg>
      <span className="flex-1">{displayMessage}</span>
    </div>
  );
}
