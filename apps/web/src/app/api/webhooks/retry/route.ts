import { NextRequest } from 'next/server';
import { readJsonBody, withRouteErrorHandling } from '../../../../lib/route-handler';
import { successResponse } from '../../../../lib/api-response-utils';
import { getDeliveryHistoryStore, updateDeliveryHistoryStore } from '../history/route';
import { retryDeliveryItem, computeDeliveryStats } from '../../../webhook-retry-dashboard-utils';
import { codedErrorResponse } from '../../../../lib/error-codes';

export const POST = withRouteErrorHandling('POST /api/webhooks/retry', async (request: NextRequest) => {
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

  const { updatedItems, retriedItem } = retryDeliveryItem(items, id);
  updateDeliveryHistoryStore(updatedItems);
  const stats = computeDeliveryStats(updatedItems);

  return successResponse({
    success: true,
    item: retriedItem,
    stats,
  });
});
