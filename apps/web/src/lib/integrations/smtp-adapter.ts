/**
 * SMTP Email Integration Adapter
 *
 * Provides a real API adapter for SMTP configuration and email operations.
 * Follows the pattern established by pagerduty-adapter.ts and sentry-adapter.ts.
 */

import type { SmtpConfig } from './smtp-validation';
import type { EmailLogEntry } from '../../app/integrate-smtp-email-integration-utils';

export interface SmtpAdapterOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SmtpConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface EmailHistoryResponse {
  history: EmailLogEntry[];
}

export interface SendTestEmailPayload {
  to: string;
}

export interface SendTestEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function createAbortSignal(timeoutMs: number | undefined): AbortSignal | undefined {
  if (!timeoutMs || timeoutMs <= 0) {
    return undefined;
  }

  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function createSmtpAdapter(options: SmtpAdapterOptions = {}) {
  const apiBase = options.apiBase ?? '/api/integrations/smtp';
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    /**
     * Load SMTP configuration from the backend.
     * GET /api/integrations/smtp/config
     */
    async loadConfig(): Promise<SmtpConfig | null> {
      try {
        const response = await fetchImpl(`${apiBase}/config`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Failed to load config: ${response.statusText}`);
        }

        return ((await response.json()) as { data: SmtpConfig | null }).data ?? null;
      } catch (error) {
        console.error('Error loading SMTP config:', error);
        throw error;
      }
    },

    /**
     * Save SMTP configuration to the backend.
     * POST /api/integrations/smtp/config
     */
    async saveConfig(config: SmtpConfig): Promise<void> {
      try {
        const response = await fetchImpl(`${apiBase}/config`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          throw new Error(`Failed to save config: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error saving SMTP config:', error);
        throw error;
      }
    },

    /**
     * Verify that the saved SMTP server is reachable and credentials are valid.
     * POST /api/integrations/smtp/test-connection
     */
    async testConnection(config: SmtpConfig): Promise<SmtpConnectionTestResult> {
      try {
        const response = await fetchImpl(`${apiBase}/test-connection`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          return {
            success: false,
            error: err.error || err.message || response.statusText,
          };
        }

        const result = (await response.json()) as { data?: { success?: boolean; error?: string } };
        return { success: result.data?.success ?? true };
      } catch (error) {
        console.error('Error testing SMTP connection:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Send a test email to confirm end-to-end delivery.
     * POST /api/integrations/smtp/send
     */
    async sendTestEmail(payload: SendTestEmailPayload): Promise<SendTestEmailResult> {
      try {
        const response = await fetchImpl(`${apiBase}/send`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          return {
            success: false,
            error: err.error || err.message || response.statusText,
          };
        }

        return ((await response.json()) as { data: SendTestEmailResult }).data;
      } catch (error) {
        console.error('Error sending test email:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Fetch recent email send history from the backend.
     * GET /api/integrations/smtp/history
     */
    async fetchHistory(): Promise<EmailLogEntry[]> {
      try {
        const response = await fetchImpl(`${apiBase}/history`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.statusText}`);
        }

        const json = (await response.json()) as { data?: EmailHistoryResponse };
        return json.data?.history ?? [];
      } catch (error) {
        console.error('Error fetching SMTP email history:', error);
        throw error;
      }
    },
  };
}
