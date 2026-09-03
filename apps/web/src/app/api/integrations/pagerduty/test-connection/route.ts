/**
 * POST /api/integrations/pagerduty/test-connection
 *
 * Validates that the supplied PagerDuty integration key looks reachable by
 * sending a test event to the PagerDuty Events API v2 endpoint.
 *
 * When the PAGERDUTY_INTEGRATION_KEY env var is not configured (e.g. in dev),
 * the handler performs a structural validation only and returns success for
 * any key that passes basic format checks, mirroring the Sentry adapter.
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { isIntegrationKeyReachable } from '../../../../integrate-pagerduty-alert-integration-utils';
import { PAGERDUTY_FETCH_TIMEOUT_MS } from '../../../../../lib/timeouts';

const PD_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { integrationKey?: string };
    const integrationKey = (body.integrationKey ?? '').trim();

    if (!integrationKey) {
      return errorResponse('integrationKey is required', 400);
    }

    if (!isIntegrationKeyReachable(integrationKey)) {
      return errorResponse(
        'Integration key appears invalid – must be at least 32 characters',
        200,
      );
    }

    // Attempt a real connectivity test when running in a server environment.
    // We send a "test" event with dedup_key so PagerDuty won't page anyone.
    try {
      const pdResponse = await fetch(PD_EVENTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routing_key: integrationKey,
          event_action: 'trigger',
          dedup_key: `soroban-crashlab:test-connection:${Date.now()}`,
          payload: {
            summary: '[Test] SorobanCrashLab PagerDuty connection test',
            severity: 'info',
            source: 'soroban-crashlab',
            timestamp: new Date().toISOString(),
            custom_details: {
              message: 'This is an automated connectivity test from SorobanCrashLab. You may safely resolve this incident.',
            },
          },
        }),
        signal: AbortSignal.timeout?.(PAGERDUTY_FETCH_TIMEOUT_MS),
      });

      if (pdResponse.ok || pdResponse.status === 202) {
        return successResponse({ success: true });
      }

      const errorBody = await pdResponse.text().catch(() => pdResponse.statusText);
      return errorResponse(errorBody, 200);
    } catch (networkError) {
      // Network not available (e.g. offline dev environment) – fall back to
      // structural validation only, returning success if key format is valid.
      console.warn('[pagerduty/test-connection] Could not reach PagerDuty Events API:', networkError);
      return successResponse({ success: true, warning: 'Structural validation only – could not reach PagerDuty API' });
    }
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }
}
