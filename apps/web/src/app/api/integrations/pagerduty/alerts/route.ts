/**
 * GET  /api/integrations/pagerduty/alerts — dashboard alert list.
 * POST /api/integrations/pagerduty/alerts — alert lifecycle (#1892).
 *
 * GET returns the dispatcher's incidents (status reflects PagerDuty acks via
 * the webhook route). Until the dispatcher has seen an alert it serves mock
 * data, so the page still renders in dev/demo.
 *
 * POST actions:
 *   { action: 'ingest', event }                  producer entry point
 *   { action: 'acknowledge', id, actor? }        dashboard ack → channels
 *   { action: 'resolve', id, actor?, note? }     dashboard resolve → channels
 *   { action: 'clear', dedupKey, note }          condition recovered → auto-resolve
 *   { action: 'tick' }                           escalation + quiet-hours release
 */

import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/api-response-utils';
import { checkRequestSize } from '@/lib/request-size-limits';
import { withSizeLimitAndLogging } from '@/lib/route-handler';
import { getAlertDispatcher } from '@/lib/notifications/alert-runtime';
import { ALERT_SEVERITIES } from '@/lib/notifications/alert-policy';
import type { PagerDutyAlert } from '../../../../../features/integrations/integrate-pagerduty-alert-integration-utils';

// Mock data for dev/demo use when PagerDuty is not yet configured.
const MOCK_ALERTS: PagerDutyAlert[] = [
  {
    id: 'alert-001',
    runId: 'run-abc123',
    signature: 'SIGSEGV:0x0000000000000000',
    severity: 'critical',
    triggeredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'acknowledged',
    dedupKey: 'soroban-crashlab:run-abc123:SIGSEGV:0x0000000000000000',
    pdIncidentKey: 'Q2NWQTB9BCTHTU',
  },
  {
    id: 'alert-002',
    runId: 'run-def456',
    signature: 'SIGABRT:libc.so.6:raise',
    severity: 'error',
    triggeredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'triggered',
    dedupKey: 'soroban-crashlab:run-def456:SIGABRT:libc.so.6:raise',
  },
  {
    id: 'alert-003',
    runId: 'run-ghi789',
    signature: 'SIGFPE:arithmetic_exception',
    severity: 'warning',
    triggeredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    status: 'resolved',
    dedupKey: 'soroban-crashlab:run-ghi789:SIGFPE:arithmetic_exception',
    pdIncidentKey: 'Q3MXPRT2ACBVWZ',
  },
];

const LifecycleSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ingest'),
    event: z.object({
      source: z.string().min(1),
      severity: z.enum(ALERT_SEVERITIES),
      fingerprint: z.string().min(1),
      summary: z.string().min(1),
      details: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({ action: z.literal('acknowledge'), id: z.string().min(1), actor: z.string().optional() }),
  z.object({ action: z.literal('resolve'), id: z.string().min(1), actor: z.string().optional(), note: z.string().optional() }),
  z.object({ action: z.literal('clear'), dedupKey: z.string().min(1), note: z.string().min(1) }),
  z.object({ action: z.literal('tick') }),
]);

export async function GET() {
  const dispatcher = getAlertDispatcher();
  const incidents = dispatcher.list();
  if (incidents.length === 0) return successResponse({ alerts: MOCK_ALERTS });

  return successResponse({
    alerts: incidents.map((incident) => ({
      id: incident.id,
      runId: incident.fingerprint,
      signature: incident.fingerprint,
      severity: incident.severity,
      triggeredAt: incident.createdAt,
      status: incident.status,
      dedupKey: incident.dedupKey,
      route: incident.routeId,
      occurrences: incident.occurrences,
      escalationLevel: incident.escalationLevel,
      slaBreached: dispatcher.isSlaBreached(incident),
      resolutionNote: incident.resolutionNote,
    })),
  });
}

async function postHandler(request: Request) {
  const sizeError = checkRequestSize(request);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }

  const parsed = LifecycleSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.errors[0].message, 400);

  const dispatcher = getAlertDispatcher();
  const input = parsed.data;
  try {
    switch (input.action) {
      case 'ingest':
        return successResponse(await dispatcher.ingest(input.event));
      case 'acknowledge':
        return successResponse({ incident: await dispatcher.acknowledge(input.id, input.actor ?? 'dashboard') });
      case 'resolve':
        return successResponse({ incident: await dispatcher.resolve(input.id, input.actor ?? 'dashboard', input.note) });
      case 'clear':
        return successResponse({ incident: await dispatcher.clear(input.dedupKey, input.note) });
      case 'tick':
        return successResponse({ sent: (await dispatcher.tick()).length });
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Alert action failed', 404);
  }
}

export const POST = withSizeLimitAndLogging('POST /api/integrations/pagerduty/alerts', postHandler);
