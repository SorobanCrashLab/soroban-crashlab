'use client';

/**
 * WidgetErrorBoundary — a reusable, per-widget error scope.
 *
 * Wraps the shared {@link ErrorBoundary} class component with a compact fallback
 * UI that matches the SegmentError.tsx visual language: red accent, icon,
 * widget title, and a retry button.
 *
 * Usage:
 * ```tsx
 * <WidgetErrorBoundary title="Run Health Score" onError={notifyError}>
 *   <RunHealthScoreWidget ... />
 * </WidgetErrorBoundary>
 * ```
 *
 * When the wrapped child throws, only that widget is replaced by the fallback;
 * the rest of the dashboard/triage page continues to work. Clicking "Retry"
 * unmounts and remounts the child so it can recover if the error was transient.
 */

import React, { type ErrorInfo, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export interface WidgetErrorBoundaryProps {
  /** Display name shown in the fallback card header. */
  title: string;
  children: ReactNode;
  /**
   * Called when the child throws. Wired to the toast system from a parent
   * client component so callers can surface the error non-intrusively.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

function WidgetFallback({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-label={`${title} widget error`}
      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 p-4 flex flex-col gap-3"
      data-testid="widget-error-boundary-fallback"
    >
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-3.5 h-3.5 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-red-800 dark:text-red-200">
          {title}
        </span>
      </div>

      {error.message && (
        <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1 break-all">
          {error.message}
        </p>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9"
          />
        </svg>
        Retry
      </button>
    </div>
  );
}

/**
 * Scope an error boundary to a single widget.
 *
 * A crash inside the child replaces only that widget with a compact error card.
 * The rest of the page is unaffected.
 */
export function WidgetErrorBoundary({
  title,
  children,
  onError,
}: WidgetErrorBoundaryProps) {
  return (
    <ErrorBoundary
      onError={onError}
      fallback={(error: Error, reset: () => void) => (
        <WidgetFallback title={title} error={error} onRetry={reset} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default WidgetErrorBoundary;
