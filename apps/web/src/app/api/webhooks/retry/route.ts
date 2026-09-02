import { NextRequest } from 'next/server';
import { jsonError, readJsonBody, withRouteErrorHandling } from '../../../../lib/route-handler';
import { successResponse } from '../../../../lib/api-response-utils';
import { getDeliveryHistoryStore, updateDeliveryHistoryStore } from '../history/route';
import { retryDeliveryItem, computeDeliveryStats } from '../../../webhook-retry-dashboard-utils';

export const POST = withRouteErrorHandling('POST /api/webhooks/retry', async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;

  const body = parsedBody.body as Record<string, unknown>;
  const id = typeof body?.id === 'string' ? body.id.trim() : null;

  if (!id) {
    return jsonError('Field "id" is required.', 400);
  }

  const items = getDeliveryHistoryStore();
  const existing = items.find((item) => item.id === id);

  if (!existing) {
    return jsonError(`Webhook delivery record with ID "${id}" not found.`, 404);
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
