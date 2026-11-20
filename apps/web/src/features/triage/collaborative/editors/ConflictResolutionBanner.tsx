'use client';

/**
 * Manual conflict resolution banner (#2192).
 *
 * Shows when auto-merge fails. Offers Accept (take remote) or Merge
 * (manual resolution) actions.
 */

import { memo } from 'react';

export interface ConflictInfo {
  field: string;
  user: string;
  theirValue: string;
  yourValue: string;
}

interface ConflictResolutionBannerProps {
  conflict: ConflictInfo | null;
  onAccept: () => void;
  onMerge: () => void;
  onDismiss: () => void;
}

function ConflictResolutionBannerBase({
  conflict,
  onAccept,
  onMerge,
  onDismiss,
}: ConflictResolutionBannerProps) {
  if (!conflict) return null;

  return (
    <div
      className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.67 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
            {conflict.user} changed <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">{conflict.field}</code> while you were editing.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            Their value: {conflict.theirValue} · Your value: {conflict.yourValue}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onAccept}
              className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 font-medium"
            >
              Accept Theirs
            </button>
            <button
              type="button"
              onClick={onMerge}
              className="text-xs px-3 py-1.5 rounded-md border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Merge Manually
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs px-3 py-1.5 text-amber-600 dark:text-amber-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ConflictResolutionBanner = memo(ConflictResolutionBannerBase);
