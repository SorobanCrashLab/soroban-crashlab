import { withSizeLimitAndLogging } from '@/lib/route-handler';
/**
 * POST /api/integrations/pagerduty/webhook (#1892)
 *
 * Receives PagerDuty v3 webhooks so an ack/resolve done in PagerDuty is
 * reflected in the dashboard alert list. The body is authenticated with the
 * subscription's signing secret (`X-PagerDuty-Signature: v1=<hex HMAC-SHA256>`;
 * several signatures may be present during secret rotation).
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { getAlertDispatcher } from '@/lib/notifications/alert-runtime';
import { verifyPagerDutySignature } from '@/lib/notifications/pagerduty-signature';

const STATUS_BY_EVENT: Record<string, 'acknowledged' | 'resolved'> = {
  'incident.acknowledged': 'acknowledged',
  'incident.resolved': 'resolved',
};

async function postHandler(request: Request) {
  const secret = process.env.PAGERDUTY_WEBHOOK_SECRET?.trim();
  if (!secret) return errorResponse('PagerDuty webhook secret is not configured', 503);

  const rawBody = await request.text();
  if (!verifyPagerDutySignature(rawBody, request.headers.get('x-pagerduty-signature'), secret)) {
    return errorResponse('Invalid PagerDuty signature', 401);
  }

  let payload: { event?: { event_type?: string; agent?: { summary?: string }; data?: { incident_key?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const status = STATUS_BY_EVENT[payload.event?.event_type ?? ''];
  const dedupKey = payload.event?.data?.incident_key;
  if (!status || !dedupKey) return successResponse({ ignored: true });

  const incident = await getAlertDispatcher().applyRemoteStatus(
    dedupKey,
    status,
    `pagerduty:${payload.event?.agent?.summary ?? 'unknown'}`,
  );
  return successResponse({ ignored: incident === null, incident });
}

export const POST = withSizeLimitAndLogging('POST /api/integrations/pagerduty/webhook', postHandler);
