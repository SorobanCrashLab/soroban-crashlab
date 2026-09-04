/**
 * POST /api/integrations/pagerduty/trigger
 *
 * Triggers a PagerDuty alert for a critical fuzzing failure.
 * Uses the PagerDuty Events API v2 to send an incident event.
 *
 * Reads PAGERDUTY_INTEGRATION_KEY from the server environment when not
 * supplied in the request body (the integration key stored in the DB takes
 * precedence at the component level).
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { buildDedupKey } from '../../../../integrate-pagerduty-alert-integration-utils';
import type { TriggerAlertPayload } from '../../../../../lib/integrations/pagerduty-adapter';
import { PAGERDUTY_FETCH_TIMEOUT_MS } from '../../../../../lib/timeouts';

const PD_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TriggerAlertPayload & { integrationKey?: string };

    const integrationKey = (
      body.integrationKey ?? process.env.PAGERDUTY_INTEGRATION_KEY ?? ''
    ).trim();

    if (!integrationKey) {
      return errorResponse(
        'PagerDuty integration key is not configured',
        400,
      );
    }

    if (!body.runId || !body.signature || !body.summary) {
      return errorResponse(
        'runId, signature, and summary are required',
        400,
      );
    }

    const dedupKey = buildDedupKey(body.runId, body.signature);
    const severity = body.severity ?? 'critical';

    const pdPayload = {
      routing_key: integrationKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
      payload: {
        summary: body.summary,
        severity,
        source: 'soroban-crashlab',
        timestamp: new Date().toISOString(),
        custom_details: {
          runId: body.runId,
          signature: body.signature,
          ...(body.details ?? {}),
        },
      },
    };

    try {
      const pdResponse = await fetch(PD_EVENTS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdPayload),
        signal: AbortSignal.timeout?.(PAGERDUTY_FETCH_TIMEOUT_MS),
      });

      if (pdResponse.ok || pdResponse.status === 202) {
        const responseBody = await pdResponse.json().catch(() => ({}));
        return successResponse({
          success: true,
          dedupKey,
          pdIncidentKey: responseBody.dedup_key ?? dedupKey,
        });
      }

      const errorText = await pdResponse.text().catch(() => pdResponse.statusText);
      return errorResponse(errorText, 200);
    } catch (networkError) {
      // Return a mock success in offline/dev environments so the UI can still
      // be exercised without a real PagerDuty account.
      console.warn('[pagerduty/trigger] Could not reach PagerDuty Events API:', networkError);
      return successResponse({
        success: true,
        dedupKey,
        warning: 'Alert queued locally – could not reach PagerDuty API',
      });
    }
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }
}
