/**
 * OperationProgressIndicator — reusable progress indicator for long-running
 * operations such as exports and replays.
 *
 * Modes
 * ──────
 * • Determinate  — pass `progress` with `current` and `total` to show an
 *                  exact percentage bar.  Use this when the operation reports
 *                  step-by-step advancement (e.g. the Replay UI).
 * • Indeterminate — omit `progress` (or pass `total === 0`).  Shows a
 *                   sliding highlight bar.  Use this when only a status enum
 *                   is available (e.g. client-side export builds).
 *
 * States
 * ──────
 * idle      – not shown (component renders null)
 * running   – bar animates / fills, label shows the `runningLabel` prop
 * done      – bar fills to 100 %, green success colours
 * failed    – bar fills to 100 %, rose error colours + optional `errorMessage`
 *
 * Accessibility
 * ─────────────
 * • role="progressbar" with aria-valuenow / aria-valuemin / aria-valuemax
 *   for determinate mode.
 * • aria-valuetext for screen-reader-friendly percentage text.
 * • aria-live="polite" on the status label so state changes are announced.
 * • Reduced-motion: the indeterminate bar becomes a static 40 % bar via the
 *   `.op-progress-bar-indeterminate` class hook in globals.css.
 *
 * Theming
 * ───────
 * Uses CSS custom properties (--color-primary, surface/border tokens) and
 * Tailwind `dark:` classes — no hard-coded colour values.
 */

'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OperationStatus = 'idle' | 'running' | 'done' | 'failed';

export interface DeterminateProgress {
  /** Steps completed so far (0 … total). */
  current: number;
  /** Total number of steps. Must be > 0 for determinate mode. */
  total: number;
}

export interface OperationProgressIndicatorProps {
  /** Current state of the operation. */
  status: OperationStatus;
  /**
   * Optional step progress.  When provided and `total > 0`, the bar is
   * determinate and shows an exact percentage.  When omitted (or total === 0)
   * the bar is indeterminate.
   */
  progress?: DeterminateProgress;
  /** Label shown while the operation is running. Default: "Running…" */
  runningLabel?: string;
  /** Label shown on success. Default: "Done" */
  doneLabel?: string;
  /** Label shown on failure. Default: "Failed" */
  failedLabel?: string;
  /** Optional human-readable error detail shown below the bar on failure. */
  errorMessage?: string;
  /** Extra Tailwind classes applied to the outermost wrapper. */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OperationProgressIndicator({
  status,
  progress,
  runningLabel = 'Running…',
  doneLabel = 'Done',
  failedLabel = 'Failed',
  errorMessage,
  className = '',
}: OperationProgressIndicatorProps) {
  // Do not render anything in idle state.
  if (status === 'idle') return null;

  const isDeterminate =
    progress !== undefined && progress.total > 0;

  const percentage = isDeterminate
    ? clamp((progress.current / progress.total) * 100, 0, 100)
    : status === 'done' || status === 'failed'
      ? 100
      : 0; // indeterminate running — no fixed value

  // ── Colour tokens ──────────────────────────────────────────────────────────
  // running  → primary blue
  // done     → success green
  // failed   → error rose
  const trackColour =
    'bg-zinc-200 dark:bg-zinc-800';

  const fillColour =
    status === 'failed'
      ? 'bg-rose-500 dark:bg-rose-600'
      : status === 'done'
        ? 'bg-emerald-500 dark:bg-emerald-600'
        : 'bg-[#0A66C2] dark:bg-[#5AA7F0]';

  // Indeterminate sliding highlight uses the same primary colour but with
  // a semi-transparent overlay so the track colour shows through.
  const indeterminateHighlight =
    status === 'failed'
      ? 'bg-rose-400 dark:bg-rose-500'
      : 'bg-[#0A66C2]/70 dark:bg-[#5AA7F0]/70';

  // ── Label text ─────────────────────────────────────────────────────────────
  const labelText =
    status === 'done'
      ? doneLabel
      : status === 'failed'
        ? failedLabel
        : isDeterminate
          ? `${runningLabel} ${percentage.toFixed(0)}%`
          : runningLabel;

  const labelColour =
    status === 'failed'
      ? 'text-rose-700 dark:text-rose-300'
      : status === 'done'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-[#0A66C2] dark:text-[#5AA7F0]';

  // ── ARIA ───────────────────────────────────────────────────────────────────
  const ariaProps = isDeterminate
    ? {
        role: 'progressbar' as const,
        'aria-valuenow': Math.round(percentage),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuetext': `${Math.round(percentage)}% complete`,
      }
    : {
        role: 'progressbar' as const,
        'aria-valuetext':
          status === 'done'
            ? 'Complete'
            : status === 'failed'
              ? 'Failed'
              : 'In progress',
      };

  return (
    <div
      className={`w-full min-w-0 ${className}`}
      data-testid="operation-progress-indicator"
    >
      {/* Label row */}
      <div
        className="flex-between gap-2 mb-1.5"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={`text-xs font-semibold truncate ${labelColour}`}>
          {/* State icon */}
          {status === 'done' && (
            <svg
              className="inline-block w-3.5 h-3.5 mr-1 -mt-px"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          {status === 'failed' && (
            <svg
              className="inline-block w-3.5 h-3.5 mr-1 -mt-px"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          {status === 'running' && (
            <svg
              className="inline-block w-3.5 h-3.5 mr-1 -mt-px animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          {labelText}
        </span>

        {/* Percentage badge — only when determinate and running */}
        {isDeterminate && status === 'running' && (
          <span
            className="flex-shrink-0 text-[10px] font-bold tabular-nums text-muted"
            aria-hidden="true"
          >
            {Math.round(percentage)}%
          </span>
        )}
      </div>

      {/* Progress track */}
      <div
        {...ariaProps}
        className={`relative h-2 w-full overflow-hidden rounded-full ${trackColour}`}
      >
        {isDeterminate || status === 'done' || status === 'failed' ? (
          /* Determinate fill */
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${fillColour}`}
            style={{ width: `${percentage}%` }}
          />
        ) : (
          /* Indeterminate sliding bar — clip overflow on parent */
          <div
            className={`op-progress-bar-indeterminate absolute inset-y-0 w-1/4 rounded-full ${indeterminateHighlight}`}
            style={{
              animation: 'op-progress-indeterminate 1.6s linear infinite',
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Error message */}
      {status === 'failed' && errorMessage && (
        <p
          role="alert"
          className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-300 truncate"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
