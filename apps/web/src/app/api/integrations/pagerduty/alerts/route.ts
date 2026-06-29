/**
 * GET /api/integrations/pagerduty/alerts
 *
 * Returns recent PagerDuty alerts. This endpoint serves mock data in
 * development (when PAGERDUTY_INTEGRATION_KEY is absent) and forwards
 * to a real backend in production.
 */

import { NextResponse } from 'next/server';
import type { PagerDutyAlert } from '../../../../integrate-pagerduty-alert-integration-utils';

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

export async function GET() {
  return NextResponse.json({ alerts: MOCK_ALERTS });
}
