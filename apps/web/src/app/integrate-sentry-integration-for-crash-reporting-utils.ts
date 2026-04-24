/**
 * Issue #248 – Integrate: Sentry integration for crash reporting
 *
 * Pure utility functions extracted from IntegrateSentryIntegrationForCrashReporting.
 * Free of React/browser dependencies for deterministic unit testing.
 */

export interface SentryConfig {
  dsn: string;
  environment: string;
  enabled: boolean;
  sampleRate: number;
  tracesSampleRate: number;
}

export type CrashReportStatus = 'sent' | 'pending' | 'failed';

export interface CrashReport {
  id: string;
  timestamp: string;
  signature: string;
  sentryEventId: string;
  status: CrashReportStatus;
}

export interface SentryConfigValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates a Sentry configuration object for required env/config contracts. */
export function validateSentryConfig(config: SentryConfig): SentryConfigValidation {
  const errors: string[] = [];

  if (!config.dsn) {
    errors.push('DSN is required');
  } else if (!config.dsn.includes('sentry.io') && !config.dsn.includes('ingest')) {
    errors.push('DSN must be a valid Sentry DSN (must contain sentry.io or ingest)');
  }

  if (!config.environment) {
    errors.push('environment is required');
  }

  if (config.sampleRate < 0 || config.sampleRate > 1) {
    errors.push('sampleRate must be between 0 and 1 inclusive');
  }

  if (config.tracesSampleRate < 0 || config.tracesSampleRate > 1) {
    errors.push('tracesSampleRate must be between 0 and 1 inclusive');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Determines if a DSN string passes the connection check used by
 * handleTestConnection — mirrors the production conditional exactly.
 */
export function isDsnReachable(dsn: string): boolean {
  return dsn.includes('sentry.io') || dsn.includes('ingest');
}

export interface CrashReportValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates a CrashReport for observable required fields. */
export function validateCrashReport(report: CrashReport): CrashReportValidation {
  const errors: string[] = [];

  if (!report.id) errors.push('id is required');
  if (!report.timestamp) errors.push('timestamp is required');
  else {
    const d = new Date(report.timestamp);
    if (isNaN(d.getTime())) errors.push('timestamp must be a valid ISO date');
  }
  if (!report.signature) errors.push('signature is required');
  if (!report.sentryEventId) errors.push('sentryEventId is required');

  const validStatuses: CrashReportStatus[] = ['sent', 'pending', 'failed'];
  if (!validStatuses.includes(report.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  return { isValid: errors.length === 0, errors };
}

export interface ReportSummary {
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

/** Aggregates crash report status counts. */
export function summariseReports(reports: CrashReport[]): ReportSummary {
  return reports.reduce<ReportSummary>(
    (acc, r) => ({
      total: acc.total + 1,
      sent: acc.sent + (r.status === 'sent' ? 1 : 0),
      pending: acc.pending + (r.status === 'pending' ? 1 : 0),
      failed: acc.failed + (r.status === 'failed' ? 1 : 0),
    }),
    { total: 0, sent: 0, pending: 0, failed: 0 }
  );
}

/** Formats an ISO timestamp for display. Returns the original string if invalid. */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Builds the Sentry event URL for a given event ID. */
export function buildSentryEventUrl(sentryEventId: string): string {
  return `https://sentry.io/events/${sentryEventId}/`;
}
