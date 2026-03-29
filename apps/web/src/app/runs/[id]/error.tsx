'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the /runs/[id] detail page.
 */
export default function RunDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Run Detail Error]', error);
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
                d="M9 12h6m-3-3v6M5.07 19A9 9 0 1118.93 5 9 9 0 015.07 19z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
          Run not found
        </h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-1">
          This run may have been deleted or the ID is invalid.
        </p>
        {error.message && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mt-3 mb-5 break-all">
            {error.message}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow active:scale-95 text-sm"
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
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium rounded-xl transition-all text-sm"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
