'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { buildErrorPresentation, type RecoveryAction } from '@/lib/error-taxonomy';
import {
  buildReportIssueUrl,
  buildReportProblemPayload,
  type ReportedEvent,
} from '@/lib/report-problem';

export interface RouteErrorFallbackProps {
  /** The error React handed to the boundary. */
  error: Error & { digest?: string };
  /** Re-runs the failed render. Safe only for idempotent reads. */
  reset: () => void;
  /** Path of the failing route, e.g. `/runs/run-42`. Used for the report. */
  route: string;
  /** HTTP status / machine code when the failure came from an API response. */
  status?: number;
  code?: string;
  /** Correlation id returned by the API, if the caller could recover one. */
  requestId?: string;
  /** Recent client-side events attached to a report. */
  events?: readonly ReportedEvent[];
}

/**
 * Class-aware route error boundary fallback (#1879).
 *
 * One component for all five error classes: `buildErrorPresentation` decides
 * the copy and the recovery affordances, this file only renders them. Every
 * generated `error.tsx` under `app/**` is a thin wrapper around it, so a new
 * route inherits the whole taxonomy by copying a five-line file.
 */
export default function RouteErrorFallback({
  error,
  reset,
  route,
  status,
  code,
  requestId,
  events,
}: RouteErrorFallbackProps) {
  const [copied, setCopied] = useState<'request-id' | 'details' | null>(null);

  const presentation = buildErrorPresentation({
    ...(status !== undefined ? { status } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
    route,
    idempotentRead: true,
  });

  const reportPayload = buildReportProblemPayload({
    route,
    ...(requestId !== undefined ? { requestId } : {}),
    errorClass: presentation.errorClass,
    summary: error?.message || presentation.title,
    ...(events !== undefined ? { events } : {}),
  });

  const details = [
    `route: ${reportPayload.route}`,
    `class: ${presentation.errorClass}`,
    code ? `code: ${code}` : '',
    requestId ? `request_id: ${requestId}` : '',
    error?.digest ? `digest: ${error.digest}` : '',
    error?.message ? `message: ${error.message}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const copy = useCallback((value: string, what: 'request-id' | 'details') => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 py-16 max-w-2xl mx-auto w-full">
      <div
        className="w-full border border-red-200 dark:border-red-900/50 rounded-2xl p-8 bg-red-50/60 dark:bg-red-950/20 shadow-sm text-center"
        role="alert"
        data-error-class={presentation.errorClass}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-3">
          {presentation.errorClass}
        </p>
        <h2 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">{presentation.title}</h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-5">{presentation.cause}</p>

        {presentation.showRequestId && requestId && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-5 break-all">
            request_id: {requestId}{' '}
            <button
              type="button"
              onClick={() => copy(requestId, 'request-id')}
              className="underline font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
            >
              {copied === 'request-id' ? 'copied' : 'copy'}
            </button>
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {presentation.actions.map((action: RecoveryAction) =>
            action.kind === 'retry' ? (
              <button
                key={action.id}
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow active:scale-95 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {action.label}
              </button>
            ) : action.kind === 'report' ? (
              <a
                key={action.id}
                href={buildReportIssueUrl(reportPayload)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium rounded-xl transition-all text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {action.label}
              </a>
            ) : (
              <Link
                key={action.id}
                href={action.href ?? '/runs'}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium rounded-xl transition-all text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {action.label}
              </Link>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => copy(details, 'details')}
          className="mt-6 text-xs font-semibold text-red-600 dark:text-red-400 underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
        >
          {copied === 'details' ? 'details copied' : 'copy error details'}
        </button>
      </div>
    </div>
  );
}
