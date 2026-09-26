import { WebhookDeliveryHistoryItem } from '../fixtures/webhook-delivery-history';
import { absoluteShort } from './utils/datetime';

export type { WebhookDeliveryHistoryItem };

export type DeliveryStatusFilter = 'all' | WebhookDeliveryHistoryItem['status'];

export interface DeliveryStats {
  totalCount: number;
  deliveredCount: number;
  failedCount: number;
  queuedCount: number;
  /** Dead-lettered deliveries parked for manual escalation (#1635). */
  parkedCount: number;
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
      parkedCount: 0,
      successRate: 100,
      averageAttempts: 0,
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let queuedCount = 0;
  let parkedCount = 0;
  let totalAttempts = 0;

  for (const item of items) {
    if (item.status === 'delivered') deliveredCount++;
    else if (item.status === 'failed') failedCount++;
    else if (item.status === 'queued') queuedCount++;
    else if (item.status === 'parked') parkedCount++;

    totalAttempts += item.attempts || 1;
  }

  const successRate = Math.round((deliveredCount / totalCount) * 100);
  const averageAttempts = Math.round((totalAttempts / totalCount) * 10) / 10;

  return {
    totalCount,
    deliveredCount,
    failedCount,
    queuedCount,
    parkedCount,
    successRate,
    averageAttempts,
  };
}

/**
 * Marks a delivery as queued for a durable retry (#1635). The retry route no
 * longer attempts delivery inline; it persists a retry job and the
 * webhook-recovery tick reports the outcome through `applyRecoveryResult`.
 */
export function queueDeliveryRetry(
  items: WebhookDeliveryHistoryItem[],
  itemId: string,
  nextRetryAt: string,
): { updatedItems: WebhookDeliveryHistoryItem[]; queuedItem: WebhookDeliveryHistoryItem | null } {
  let queuedItem: WebhookDeliveryHistoryItem | null = null;

  const updatedItems = items.map((item) => {
    if (item.id !== itemId) return item;
    const updated: WebhookDeliveryHistoryItem = { ...item, status: 'queued', nextRetryAt };
    queuedItem = updated;
    return updated;
  });

  return { updatedItems, queuedItem };
}

/**
 * Structural subset of a webhook-recovery tick result — kept local so this
 * client-safe module does not import the server-side recovery loop.
 */
export interface RecoveryResultForHistory {
  retries: {
    outcomes: ReadonlyArray<{
      jobId: string;
      outcome: 'delivered' | 'retry-scheduled' | 'dead-lettered';
      statusCode?: number;
      error?: string;
      nextAttemptAt?: string;
    }>;
  };
  drainedRequestIds: readonly string[];
  parkedRequestIds: readonly string[];
  evaluatedAt: string;
}

/**
 * Folds one recovery tick into the delivery history: attempted jobs record
 * their outcome, drained dead letters become delivered, and dead letters past
 * their drain budget become `parked`.
 */
export function applyRecoveryResult(
  items: WebhookDeliveryHistoryItem[],
  result: RecoveryResultForHistory,
): WebhookDeliveryHistoryItem[] {
  const outcomes = new Map(result.retries.outcomes.map((outcome) => [outcome.jobId, outcome]));
  const drained = new Set(result.drainedRequestIds);
  const parked = new Set(result.parkedRequestIds);
  const at = result.evaluatedAt;

  return items.map((item) => {
    const outcome = outcomes.get(item.id);
    if (outcome) {
      const attempted: WebhookDeliveryHistoryItem = {
        ...item,
        attempts: item.attempts + 1,
        lastAttemptedAt: at,
        statusCode: outcome.statusCode ?? item.statusCode,
      };
      if (outcome.outcome === 'delivered') {
        return { ...attempted, status: 'delivered', error: undefined, nextRetryAt: undefined };
      }
      if (outcome.outcome === 'retry-scheduled') {
        return {
          ...attempted,
          status: 'queued',
          error: outcome.error ?? item.error,
          nextRetryAt: outcome.nextAttemptAt,
        };
      }
      return {
        ...attempted,
        status: 'failed',
        error: outcome.error ?? item.error ?? 'Delivery failed',
        nextRetryAt: undefined,
      };
    }
    if (drained.has(item.id)) {
      return { ...item, status: 'delivered', error: undefined, nextRetryAt: undefined, lastAttemptedAt: at };
    }
    if (parked.has(item.id)) {
      return { ...item, status: 'parked', nextRetryAt: undefined, lastAttemptedAt: at };
    }
    return item;
  });
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
export function getStatusBadgeClass(status: WebhookDeliveryHistoryItem['status']): string {
  switch (status) {
    case 'delivered':
      return 'badge-completed';
    case 'failed':
      return 'badge-failed';
    case 'queued':
      return 'badge-running';
    case 'parked':
      return 'badge-critical';
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
