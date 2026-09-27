import { NextRequest } from 'next/server';
import { readJsonBody, withRouteErrorHandling } from '../../../../lib/route-handler';
import { successResponse } from '../../../../lib/api-response-utils';
import { getDeliveryHistoryStore, updateDeliveryHistoryStore } from '../history/route';
import { queueDeliveryRetry, computeDeliveryStats } from '../../../webhook-retry-dashboard-utils';
import { codedErrorResponse } from '../../../../lib/error-codes';
import { getWebhookRecovery } from '../../../../lib/webhook-recovery';
import { validateWebhookApiKey } from '../../../../lib/api-key-auth';

/**
 * Queues a manual retry (#1635). Delivery is not attempted inside this
 * request: a durable retry job is persisted and the webhook-recovery tick
 * runs it, so the attempt survives this function ending. Responds 202.
 */
export const POST = withRouteErrorHandling('POST /api/webhooks/retry', async (request: NextRequest) => {
  const authError = validateWebhookApiKey(request);
  if (authError) return authError;
  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const body = parsedBody.body as Record<string, unknown>;
  const id = typeof body?.id === 'string' ? body.id.trim() : null;

  if (!id) {
    return codedErrorResponse('WEBHOOK_DELIVERY_ID_REQUIRED');
  }

  const items = getDeliveryHistoryStore();
  const existing = items.find((item) => item.id === id);

  if (!existing) {
    return codedErrorResponse(
      'WEBHOOK_DELIVERY_NOT_FOUND',
      `Webhook delivery record with ID "${id}" not found.`,
    );
  }

  const recovery = getWebhookRecovery();
  // A manual retry supersedes any dead letter for the same delivery; if the
  // retry fails too, it is dead-lettered afresh with the new timeline.
  recovery.dlq.evict(`dlq-${existing.id}`);
  const job = recovery.queue.schedule({
    request: {
      id: existing.id,
      url: existing.url,
      eventType: existing.eventType,
      payload: existing.payload,
      headers: existing.headers,
      maxAttempts: existing.maxAttempts,
    },
    attemptsMade: 0,
    immediate: true,
  });

  const { updatedItems, queuedItem } = queueDeliveryRetry(items, id, job.nextAttemptAt);
  updateDeliveryHistoryStore(updatedItems);
  const stats = computeDeliveryStats(updatedItems);

  return successResponse(
    {
      success: true,
      item: queuedItem,
      stats,
      nextAttemptAt: job.nextAttemptAt,
    },
    { status: 202 },
  );
});
