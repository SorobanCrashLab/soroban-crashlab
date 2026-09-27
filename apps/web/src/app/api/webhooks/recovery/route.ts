import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { getWebhookRecovery } from '@/lib/webhook-recovery';
import { runWebhookRecoveryPass } from '../_recovery';
import { validateWebhookApiKey } from '@/lib/api-key-auth';

/**
 * POST /api/webhooks/recovery — runs one webhook-recovery tick (#1635).
 *
 * The same pass also runs on every `POST /api/schedules/tick`; this endpoint
 * lets the retry dashboard's worker advance recovery without evaluating
 * campaign schedules. Each pass is bounded, so it cannot outlive the function.
 */
export const POST = withRouteErrorHandling('POST /api/webhooks/recovery', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;

  const result = await runWebhookRecoveryPass();
  return successResponse({ ...result, metrics: getWebhookRecovery().metrics() });
});
