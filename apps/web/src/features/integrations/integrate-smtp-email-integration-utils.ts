/**
 * Pure UI-facing utility functions for the SMTP Email Integration dashboard.
 * SMTP config/message validation itself lives in
 * ../lib/integrations/smtp-email.ts — this file only covers concerns
 * specific to the dashboard (send history summarising/formatting).
 */

export type EmailLogStatus = 'sent' | 'failed';

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  status: EmailLogStatus;
  sentAt: string;
  messageId?: string;
  error?: string;
}

export interface EmailLogSummary {
  total: number;
  sent: number;
  failed: number;
}

/** Aggregates email log status counts. */
export function summariseEmailLog(entries: EmailLogEntry[]): EmailLogSummary {
  return entries.reduce<EmailLogSummary>(
    (acc, entry) => ({
      total: acc.total + 1,
      sent: acc.sent + (entry.status === 'sent' ? 1 : 0),
      failed: acc.failed + (entry.status === 'failed' ? 1 : 0),
    }),
    { total: 0, sent: 0, failed: 0 },
  );
}

/** Formats an ISO timestamp for display. Returns the original string if invalid. */
export function formatEmailTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Human-readable label for an email log status. */
export function emailStatusLabel(status: EmailLogStatus): string {
  return status === 'sent' ? 'Sent' : 'Failed';
}
