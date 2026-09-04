import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '../../../../lib/route-handler';
import { MOCK_WEBHOOK_DELIVERY_HISTORY, WebhookDeliveryHistoryItem } from '../../../../fixtures/webhook-delivery-history';
import { filterDeliveryItems, computeDeliveryStats, DeliveryStatusFilter } from '../../../webhook-retry-dashboard-utils';
import { withFixtureCaching } from '@/lib/fixture-caching';

// In-memory store initialized with fixtures for runtime persistence during session
let inMemoryHistory: WebhookDeliveryHistoryItem[] = [...MOCK_WEBHOOK_DELIVERY_HISTORY];

export function getDeliveryHistoryStore(): WebhookDeliveryHistoryItem[] {
  return inMemoryHistory;
}

export function updateDeliveryHistoryStore(updatedItems: WebhookDeliveryHistoryItem[]): void {
  inMemoryHistory = updatedItems;
}

export const GET = withRouteErrorHandling('GET /api/webhooks/history', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get('status') || 'all') as DeliveryStatusFilter;
  const searchParam = searchParams.get('search') || '';

  const items = getDeliveryHistoryStore();
  const filtered = filterDeliveryItems(items, statusParam, searchParam);
  const stats = computeDeliveryStats(items);

  const data = {
    items: filtered,
    stats,
    total: filtered.length,
  };
  return withFixtureCaching(request, { data });
});
