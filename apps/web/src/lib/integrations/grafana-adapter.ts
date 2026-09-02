/**
 * Grafana Integration Adapter
 *
 * Provides a real API adapter for Grafana annotation configuration and
 * annotation posting. Follows the pattern established by prometheus-adapter.ts
 * and pagerduty-adapter.ts.
 */

import { createAbortSignal } from './adapter-utils';
import type {
  GrafanaConfig,
  GrafanaAnnotation,
} from '../../app/integrate-grafana-dashboard-annotation-api-utils';

export interface GrafanaAdapterOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GrafanaConnectionTestResult {
  success: boolean;
  error?: string;
}

export interface GrafanaAnnotationsResponse {
  annotations: GrafanaAnnotation[];
}

export interface CreateAnnotationPayload {
  runId: string;
  text: string;
  tags?: string[];
  timeMs: number;
  timeEndMs?: number;
}

export interface CreateAnnotationResult {
  success: boolean;
  annotationId?: number;
  error?: string;
}

export function createGrafanaAdapter(options: GrafanaAdapterOptions = {}) {
  const apiBase = options.apiBase ?? '/api/integrations/grafana';
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    /**
     * Load Grafana configuration from the backend.
     * GET /api/integrations/grafana/config
     */
    async loadConfig(): Promise<GrafanaConfig | null> {
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

        return ((await response.json()) as { data: GrafanaConfig | null }).data ?? null;
      } catch (error) {
        console.error('Error loading Grafana config:', error);
        throw error;
      }
    },

    /**
     * Save Grafana configuration to the backend.
     * POST /api/integrations/grafana/config
     */
    async saveConfig(config: GrafanaConfig): Promise<void> {
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
        console.error('Error saving Grafana config:', error);
        throw error;
      }
    },

    /**
     * Test the Grafana connection with the provided base URL and API token.
     * POST /api/integrations/grafana/test-connection
     */
    async testConnection(baseUrl: string, apiToken: string): Promise<GrafanaConnectionTestResult> {
      try {
        const response = await fetchImpl(`${apiBase}/test-connection`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({ baseUrl, apiToken }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          return {
            success: false,
            error: err.error || err.message || response.statusText,
          };
        }

        const result = (await response.json()) as { data?: { success?: boolean } };
        return { success: result.data?.success ?? true };
      } catch (error) {
        console.error('Error testing Grafana connection:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Manually create a Grafana annotation for a fuzzing run event.
     * POST /api/integrations/grafana/annotations
     */
    async createAnnotation(payload: CreateAnnotationPayload): Promise<CreateAnnotationResult> {
      try {
        const response = await fetchImpl(`${apiBase}/annotations`, {
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

        return ((await response.json()) as { data: CreateAnnotationResult }).data;
      } catch (error) {
        console.error('Error creating Grafana annotation:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    /**
     * Fetch recent Grafana annotations from the backend.
     * GET /api/integrations/grafana/annotations
     */
    async fetchRecentAnnotations(): Promise<GrafanaAnnotation[]> {
      try {
        const response = await fetchImpl(`${apiBase}/annotations`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch annotations: ${response.statusText}`);
        }

        const json = (await response.json()) as { data?: GrafanaAnnotationsResponse };
        return json.data?.annotations ?? [];
      } catch (error) {
        console.error('Error fetching Grafana annotations:', error);
        throw error;
      }
    },
  };
}
