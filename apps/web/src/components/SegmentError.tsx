'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  resolveSegmentErrorMessage,
  scrubErrorMessage,
  type SegmentFamily,
} from './segment-error-messages';

export type { SegmentFamily } from './segment-error-messages';

export interface SegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  family: SegmentFamily;
}

/**
 * Shared segment-scoped error fallback for Next.js route families.
 *
 * Each family's error.tsx is a thin wrapper that passes its `family` prop here,
 * so all boundaries share one implementation with family-specific copy.
 */
export default function SegmentError({ error, reset, family }: SegmentErrorProps): ReactNode {
  const { title, message } = resolveSegmentErrorMessage(family, error);
  const detail = scrubErrorMessage(error?.message ?? '');

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 py-16 max-w-2xl mx-auto w-full">
      <div className="w-full border border-red-200 dark:border-red-900/50 rounded-2xl p-8 bg-red-50/60 dark:bg-red-950/20 shadow-sm text-center">
        <div className="flex items-center justify-center mb-5">
          <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400"
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
        </div>

        <h2 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">{title}</h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-1">{message}</p>
        {detail && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mt-3 mb-5 break-all">
            {detail}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow active:scale-95 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
