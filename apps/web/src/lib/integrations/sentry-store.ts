/**
 * Server-side logic backing the /api/sentry/* routes.
 *
 * Kept separate from the route handlers (which import `next/server`) so the
 * decision logic itself stays a plain, dependency-free module.
 */

import {
  type CrashReport,
  isDsnReachable,
} from '../../features/integrations/integrate-sentry-integration-for-crash-reporting-utils';

export interface SentryConnectionTestResult {
  success: boolean;
  error?: string;
}

/**
 * Server-side counterpart to the adapter's testConnection call. Mirrors
 * isDsnReachable's contract but returns a human-readable error alongside
 * the failure so the caller can surface it to the user.
 */
export function testSentryConnection(dsn: string): SentryConnectionTestResult {
  if (!dsn || !dsn.trim()) {
    return { success: false, error: 'DSN is required' };
  }
  if (!isDsnReachable(dsn)) {
    return {
      success: false,
      error: 'DSN must be a valid Sentry DSN (must contain sentry.io or ingest)',
    };
  }
  return { success: true };
}

/** Deterministic sample crash reports shown until a real Sentry sync exists. */
export function buildMockCrashReports(): CrashReport[] {
  return [
    {
      id: 'crash-report-1001',
      timestamp: '2026-07-20T14:32:00.000Z',
      signature: 'auth::InvalidSignatureError at simulate_transaction',
      sentryEventId: '9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c',
      status: 'sent',
    },
    {
      id: 'crash-report-1002',
      timestamp: '2026-07-21T09:15:00.000Z',
      signature: 'budget::ResourceLimitExceeded at invoke_contract',
      sentryEventId: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      status: 'pending',
    },
    {
      id: 'crash-report-1003',
      timestamp: '2026-07-22T18:47:00.000Z',
      signature: 'xdr::MalformedEnvelope at decode_transaction',
      sentryEventId: '4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
      status: 'failed',
    },
  ];
}
