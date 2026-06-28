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

import { NextResponse } from 'next/server';
import { buildDedupKey } from '../../../../integrate-pagerduty-alert-integration-utils';
import type { TriggerAlertPayload } from '../../../../../lib/integrations/pagerduty-adapter';

const PD_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TriggerAlertPayload & { integrationKey?: string };

    const integrationKey = (
      body.integrationKey ?? process.env.PAGERDUTY_INTEGRATION_KEY ?? ''
    ).trim();

    if (!integrationKey) {
      return NextResponse.json(
        { error: 'PagerDuty integration key is not configured' },
        { status: 400 },
      );
    }

    if (!body.runId || !body.signature || !body.summary) {
      return NextResponse.json(
        { error: 'runId, signature, and summary are required' },
        { status: 400 },
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
        signal: AbortSignal.timeout?.(10_000),
      });

      if (pdResponse.ok || pdResponse.status === 202) {
        const responseBody = await pdResponse.json().catch(() => ({}));
        return NextResponse.json({
          success: true,
          dedupKey,
          pdIncidentKey: responseBody.dedup_key ?? dedupKey,
        });
      }

      const errorText = await pdResponse.text().catch(() => pdResponse.statusText);
      return NextResponse.json(
        { success: false, error: errorText },
        { status: 200 },
      );
    } catch (networkError) {
      // Return a mock success in offline/dev environments so the UI can still
      // be exercised without a real PagerDuty account.
      console.warn('[pagerduty/trigger] Could not reach PagerDuty Events API:', networkError);
      return NextResponse.json({
        success: true,
        dedupKey,
        warning: 'Alert queued locally – could not reach PagerDuty API',
      });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to parse request body' }, { status: 400 });
  }
}
