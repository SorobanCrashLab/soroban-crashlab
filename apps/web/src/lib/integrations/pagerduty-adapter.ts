/**
 * PagerDuty Integration Adapter
 *
 * Provides a real API adapter for PagerDuty configuration and alert operations.
 * Follows the pattern established by sentry-adapter.ts and prometheus-adapter.ts.
 */

import type {
  PagerDutyConfig,
  PagerDutyAlert,
} from '../../app/integrate-pagerduty-alert-integration-utils';

export interface PagerDutyAdapterOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface PagerDutyConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface PagerDutyAlertsResponse {
  alerts: PagerDutyAlert[];
}

export interface TriggerAlertPayload {
  runId: string;
  signature: string;
  summary: string;
  severity?: PagerDutyAlert['severity'];
  details?: Record<string, unknown>;
}

export interface TriggerAlertResult {
  success: boolean;
  dedupKey?: string;
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

export function createPagerDutyAdapter(options: PagerDutyAdapterOptions = {}) {
  const apiBase = options.apiBase ?? '/api/integrations/pagerduty';
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    /**
     * Load PagerDuty configuration from the backend.
     * GET /api/integrations/pagerduty/config
     */
    async loadConfig(): Promise<PagerDutyConfig | null> {
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

        return await response.json();
      } catch (error) {
        console.error('Error loading PagerDuty config:', error);
        throw error;
      }
    },

    /**
     * Save PagerDuty configuration to the backend.
     * POST /api/integrations/pagerduty/config
     */
    async saveConfig(config: PagerDutyConfig): Promise<void> {
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
        console.error('Error saving PagerDuty config:', error);
        throw error;
      }
    },

    /**
     * Test the PagerDuty connection with the provided integration key.
     * POST /api/integrations/pagerduty/test-connection
     */
    async testConnection(integrationKey: string): Promise<PagerDutyConnectionTestResult> {
      try {
        const response = await fetchImpl(`${apiBase}/test-connection`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({ integrationKey }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          return {
            success: false,
            error: err.error || err.message || response.statusText,
          };
        }

        const result = await response.json();
        return { success: result.success ?? true };
      } catch (error) {
        console.error('Error testing PagerDuty connection:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Manually trigger a PagerDuty alert for a critical fuzzing failure.
     * POST /api/integrations/pagerduty/trigger
     */
    async triggerAlert(payload: TriggerAlertPayload): Promise<TriggerAlertResult> {
      try {
        const response = await fetchImpl(`${apiBase}/trigger`, {
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

        return await response.json();
      } catch (error) {
        console.error('Error triggering PagerDuty alert:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Fetch recent PagerDuty alerts from the backend.
     * GET /api/integrations/pagerduty/alerts
     */
    async fetchRecentAlerts(): Promise<PagerDutyAlert[]> {
      try {
        const response = await fetchImpl(`${apiBase}/alerts`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch alerts: ${response.statusText}`);
        }

        const data = (await response.json()) as PagerDutyAlertsResponse;
        return data.alerts ?? [];
      } catch (error) {
        console.error('Error fetching PagerDuty alerts:', error);
        throw error;
      }
    },
  };
}
