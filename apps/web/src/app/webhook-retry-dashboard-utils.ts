import { WebhookDeliveryHistoryItem } from '../fixtures/webhook-delivery-history';
import { absoluteShort } from './utils/datetime';

export type { WebhookDeliveryHistoryItem };

export type DeliveryStatusFilter = 'all' | 'delivered' | 'failed' | 'queued';

export interface DeliveryStats {
  totalCount: number;
  deliveredCount: number;
  failedCount: number;
  queuedCount: number;
  successRate: number; // percentage 0 - 100
  averageAttempts: number;
}

/**
 * Filter delivery history items by status and search query.
 */
export function filterDeliveryItems(
  items: WebhookDeliveryHistoryItem[],
  statusFilter: DeliveryStatusFilter = 'all',
  searchQuery: string = ''
): WebhookDeliveryHistoryItem[] {
  const query = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    // Status filter
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }

    // Search query matching ID, Webhook ID, URL, Event type, or Error
    if (query) {
      const matchId = item.id.toLowerCase().includes(query);
      const matchWebhookId = item.webhookId.toLowerCase().includes(query);
      const matchUrl = item.url.toLowerCase().includes(query);
      const matchEventType = item.eventType.toLowerCase().includes(query);
      const matchError = item.error ? item.error.toLowerCase().includes(query) : false;
      const matchStatusCode = item.statusCode ? String(item.statusCode).includes(query) : false;

      return matchId || matchWebhookId || matchUrl || matchEventType || matchError || matchStatusCode;
    }

    return true;
  });
}

/**
 * Compute aggregate metrics for delivery history items.
 */
export function computeDeliveryStats(items: WebhookDeliveryHistoryItem[]): DeliveryStats {
  const totalCount = items.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      queuedCount: 0,
      successRate: 100,
      averageAttempts: 0,
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let queuedCount = 0;
  let totalAttempts = 0;

  for (const item of items) {
    if (item.status === 'delivered') deliveredCount++;
    else if (item.status === 'failed') failedCount++;
    else if (item.status === 'queued') queuedCount++;

    totalAttempts += item.attempts || 1;
  }

  const successRate = Math.round((deliveredCount / totalCount) * 100);
  const averageAttempts = Math.round((totalAttempts / totalCount) * 10) / 10;

  return {
    totalCount,
    deliveredCount,
    failedCount,
    queuedCount,
    successRate,
    averageAttempts,
  };
}

/**
 * Simulate or execute a retry action for a specific delivery item by ID.
 */
export function retryDeliveryItem(
  items: WebhookDeliveryHistoryItem[],
  itemId: string
): { updatedItems: WebhookDeliveryHistoryItem[]; retriedItem: WebhookDeliveryHistoryItem | null } {
  let retriedItem: WebhookDeliveryHistoryItem | null = null;

  const updatedItems = items.map((item) => {
    if (item.id === itemId) {
      const now = new Date().toISOString();
      // Simulate successful delivery on retry if host is valid
      const isSuccess = !item.url.includes('invalid-host-name');
      const newAttempts = item.attempts + 1;

      const updated: WebhookDeliveryHistoryItem = {
        ...item,
        status: isSuccess ? 'delivered' : 'failed',
        statusCode: isSuccess ? 200 : item.statusCode || 500,
        attempts: newAttempts,
        lastAttemptedAt: now,
        error: isSuccess ? undefined : item.error || 'Retry attempt failed',
        responseBody: isSuccess ? '{"ok": true, "retried": true}' : item.responseBody,
      };

      retriedItem = updated;
      return updated;
    }
    return item;
  });

  return { updatedItems, retriedItem };
}

/**
 * Format status code to human readable text badge label.
 */
export function formatStatusCode(statusCode?: number): string {
  if (!statusCode) return 'N/A';
  if (statusCode >= 200 && statusCode < 300) return `${statusCode} OK`;
  if (statusCode === 404) return '404 Not Found';
  if (statusCode === 429) return '429 Rate Limited';
  if (statusCode === 500) return '500 Server Error';
  if (statusCode === 503) return '503 Unavailable';
  return `${statusCode}`;
}

/**
 * Get CSS badge styling class based on Navy Professional design tokens.
 */
export function getStatusBadgeClass(status: 'delivered' | 'failed' | 'queued'): string {
  switch (status) {
    case 'delivered':
      return 'badge-completed';
    case 'failed':
      return 'badge-failed';
    case 'queued':
      return 'badge-running';
    default:
      return 'badge';
  }
}

/**
 * Format ISO timestamp into user-friendly date format.
 */
export function formatTimestamp(isoString?: string): string {
  if (!isoString) return 'N/A';
  try {
    return absoluteShort(isoString);
  } catch {
    return isoString;
  }
}
