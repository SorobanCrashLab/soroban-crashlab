/**
 * Server-side in-memory store for the SMTP email integration.
 * Holds the saved SmtpConfig plus a rolling log of send attempts so the
 * dashboard's "Recent Activity" table reflects real send results.
 */

import type { SmtpConfig } from './smtp-email';
import type { EmailLogEntry } from '../../features/integrations/integrate-smtp-email-integration-utils';

const MAX_LOG_ENTRIES = 50;

let storedConfig: SmtpConfig | null = null;
let emailLog: EmailLogEntry[] = [];

export function getStoredSmtpConfig(): SmtpConfig | null {
  return storedConfig;
}

export function setStoredSmtpConfig(config: SmtpConfig): void {
  storedConfig = config;
}

export function recordEmailLogEntry(entry: EmailLogEntry): void {
  emailLog = [entry, ...emailLog].slice(0, MAX_LOG_ENTRIES);
}

export function getEmailLog(): EmailLogEntry[] {
  return emailLog;
}
