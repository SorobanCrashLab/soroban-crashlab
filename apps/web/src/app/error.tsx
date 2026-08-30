'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary — last resort when no segment boundary handles an error.
 * Deliberately minimal (reduced chrome); segment-level boundaries in each
 * route family now own the richer, recoverable fallback experience.
 */
export default function HomeError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Root Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 py-16 w-full">
      <div className="w-full max-w-md border border-red-200 dark:border-red-900/50 rounded-xl p-6 bg-red-50/60 dark:bg-red-950/20 text-center">
        <h2 className="text-base font-semibold text-red-900 dark:text-red-100 mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          An unexpected error occurred. You can retry or return to the dashboard.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium rounded-lg text-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
