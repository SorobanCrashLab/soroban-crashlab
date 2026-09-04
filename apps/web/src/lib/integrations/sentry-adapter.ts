/**
 * Sentry Integration Adapter
 *
 * Provides real API adapter for Sentry configuration and crash reporting operations.
 * Follows the pattern established by other integration adapters in the codebase.
 */

import { createAbortSignal } from './adapter-utils';
import {
  type SentryConfig,
  type CrashReport,
} from '../../app/integrate-sentry-integration-for-crash-reporting-utils';

export interface SentryAdapterOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SentryConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface CrashReportsResponse {
  reports: CrashReport[];
}

export function createSentryAdapter(options: SentryAdapterOptions = {}) {
  const apiBase = options.apiBase ?? '/api/sentry';
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    /**
     * Load Sentry configuration from the backend
     * GET /api/sentry/config
     */
    async loadConfig(): Promise<SentryConfig | null> {
      try {
        const response = await fetchImpl(`${apiBase}/config`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal,
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null; // No config saved yet
          }
          throw new Error(`Failed to load config: ${response.statusText}`);
        }

        return ((await response.json()) as { data: SentryConfig | null }).data ?? null;
      } catch (error) {
        console.error('Error loading Sentry config:', error);
        throw error;
      }
    },

    /**
     * Save Sentry configuration to the backend
     * POST /api/sentry/config
     */
    async saveConfig(config: SentryConfig): Promise<void> {
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
        console.error('Error saving Sentry config:', error);
        throw error;
      }
    },

    /**
     * Test Sentry connection with the provided DSN
     * POST /api/sentry/test-connection
     */
    async testConnection(dsn: string): Promise<SentryConnectionTestResult> {
      try {
        const response = await fetchImpl(`${apiBase}/test-connection`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({ dsn }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          return {
            success: false,
            error: error.error || error.message || response.statusText,
          };
        }

        const result = (await response.json()) as { data?: { success?: boolean } };
        return {
          success: result.data?.success ?? true,
        };
      } catch (error) {
        console.error('Error testing Sentry connection:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Fetch recent crash reports from Sentry
     * GET /api/sentry/reports
     */
    async fetchRecentReports(): Promise<CrashReport[]> {
      try {
        const response = await fetchImpl(`${apiBase}/reports`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch reports: ${response.statusText}`);
        }

        const data = await response.json() as { data?: CrashReportsResponse };
        return data.data?.reports || [];
      } catch (error) {
        console.error('Error fetching crash reports:', error);
        throw error;
      }
    },
  };
}


