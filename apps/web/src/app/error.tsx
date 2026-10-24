'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { isIdempotencyError } from '@/lib/idempotency-key';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}
import RouteErrorFallback from '../components/error/RouteErrorFallback';

/**
 * Root error boundary — last resort when no segment boundary handles an error.
 * Route segments own their richer boundary; this one applies the same global
 * error taxonomy so even an unhandled failure is classed, recoverable and
 * reportable (#1879).
 */
const IDEMP_RETRY_HINT =
  'A previous request is still being processed. Please retry in a moment.';

export default function HomeError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Root Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col  items-center justify-center min-h-[50vh] px-8 py-16 w-full">
      <div className="w-full max-w-md border border-red-200 dark:border-red-900/50 rounded-xl p-6 bg-red-50/60 dark:bg-red-950/20 text-center">
        <h2 className="text-base font-semibold text-red-900 dark:text-red-100 mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          {isIdempotencyError(error)
            ? IDEMP_RETRY_HINT
            : 'An unexpected error occurred. You can retry or return to the dashboard.'}
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
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium rounded-lg text-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} route="/" />;
}
