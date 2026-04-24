'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for the home page.
 * Rendered automatically by Next.js when an unhandled error is thrown.
 */
export default function HomeError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 py-20 max-w-2xl mx-auto w-full">
      <div className="w-full border border-red-200 dark:border-red-900/50 rounded-2xl p-8 bg-red-50/60 dark:bg-red-950/20 shadow-sm text-center">
        <div className="flex items-center justify-center mb-5">
          <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
          Failed to load dashboard
        </h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-1">
          Something went wrong while fetching your fuzzing runs.
        </p>
        {error.message && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mt-3 mb-5 break-all">
            {error.message}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
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
          Try again
        </button>
      </div>
    </div>
  );
}
