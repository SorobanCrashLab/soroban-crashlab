'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  initialErrorState,
  errorStateFromError,
  resetErrorState,
  haveResetKeysChanged,
  type ErrorBoundaryState,
} from './error-boundary-utils';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional custom fallback. Receives the caught error and a `retry` callback
   * that resets the boundary's internal state and re-renders `children`.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** Called whenever an error is caught (e.g. to report to Sentry). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Called after a successful retry/reset. */
  onReset?: () => void;
  /**
   * When any value in this array changes, the boundary auto-resets. Useful for
   * recovering when the underlying route/id the children depend on changes.
   */
  resetKeys?: readonly unknown[];
}

/**
 * Reusable React error boundary.
 *
 * Fixes #839: clicking "Retry" now resets the boundary's internal state
 * (`hasError`/`error`) via {@link resetErrorState} before re-rendering, so the
 * children actually re-mount instead of the fallback sticking around. It also
 * supports `resetKeys` for automatic recovery when inputs change.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = initialErrorState;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Render the fallback on the next pass.
    return errorStateFromError(error);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // Preserve the existing logging convention used by the route error files.
    console.error('[ErrorBoundary]', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Auto-recover when the caller's reset keys change while in an error state.
    if (
      this.state.hasError &&
      haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  /**
   * Reset internal state so the children re-render. Exposed to the fallback as
   * the `retry` callback.
   */
  reset = (): void => {
    this.setState(resetErrorState(), () => {
      this.props.onReset?.();
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;

    if (hasError && error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return <DefaultErrorFallback error={error} retry={this.reset} />;
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[40vh] px-8 py-12 max-w-2xl mx-auto w-full"
    >
      <div className="w-full border border-red-200 dark:border-red-900/50 rounded-2xl p-8 bg-red-50/60 dark:bg-red-950/20 shadow-sm text-center">
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
          Something went wrong
        </h2>
        {error.message && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mt-3 mb-5 break-all">
            {error.message}
          </p>
        )}
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </div>
  );
}

export default ErrorBoundary;
