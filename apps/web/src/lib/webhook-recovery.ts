/**
 * Webhook recovery tick (#1635).
 *
 * One pass of the recovery loop: run due retry jobs from the durable retry
 * queue, then drain the dead-letter queue (parking entries that keep failing).
 * Driven by `POST /api/schedules/tick` alongside campaign schedules, and by
 * `POST /api/webhooks/recovery` for the retry dashboard's worker. Each pass is
 * bounded, so it always finishes inside a single function invocation; work
 * that does not fit is simply left for the next tick.
 */

import {
  DeadLetterQueue,
  dlqEntryStatus,
  type DlqDrainResult,
  type DlqEntry,
  type DlqGateway,
} from './webhook-dlq';
import {
  FetchWebhookDeliveryAdapter,
  type WebhookDeliveryAdapter,
} from './webhook-delivery-worker';
import {
  WebhookRetryMetrics,
  WebhookRetryQueue,
  type RetryQueueGateway,
  type RetryTickResult,
  type WebhookRetryMetricsSnapshot,
} from './webhook-retry-queue';
import { getWebhookStore } from './webhook-store';

export interface WebhookRecoveryTickResult {
  retries: RetryTickResult;
  drain: DlqDrainResult;
  /** Request ids of DLQ entries delivered by this drain. */
  drainedRequestIds: string[];
  /** Request ids of DLQ entries parked by this drain. */
  parkedRequestIds: string[];
  evaluatedAt: string;
}

export interface WebhookRecoveryMetrics extends WebhookRetryMetricsSnapshot {
  pendingRetries: number;
  inFlightRetries: number;
  dlqDepth: number;
  parkedDepth: number;
}

export interface WebhookRecoveryOptions {
  retryGateway: RetryQueueGateway;
  dlqGateway: DlqGateway;
  adapter: WebhookDeliveryAdapter;
  metrics?: WebhookRetryMetrics;
  now?: () => Date;
  random?: () => number;
}

export interface WebhookRecovery {
  queue: WebhookRetryQueue;
  dlq: DeadLetterQueue;
  runTick(): Promise<WebhookRecoveryTickResult>;
  metrics(): WebhookRecoveryMetrics;
}

export function createWebhookRecovery(options: WebhookRecoveryOptions): WebhookRecovery {
  const now = options.now ?? (() => new Date());
  const metrics = options.metrics ?? new WebhookRetryMetrics();

  const dlq = new DeadLetterQueue({
    gateway: options.dlqGateway,
    now,
    random: options.random,
    // A drain replay carries a deterministic key so a receiver can dedupe a
    // replay that was delivered but whose acknowledgement was lost.
    replayDelivery: (entry: DlqEntry, idempotencyKey: string) =>
      options.adapter.deliver({
        id: entry.requestId,
        url: entry.endpoint,
        eventType: entry.eventType,
        payload: entry.payload,
        headers: { ...entry.headers, 'Idempotency-Key': idempotencyKey },
      }),
  });

  const queue = new WebhookRetryQueue({
    gateway: options.retryGateway,
    adapter: options.adapter,
    metrics,
    now,
    random: options.random,
    onDeadLetter: (entry) => dlq.add(entry),
  });

  return {
    queue,
    dlq,
    async runTick() {
      const retries = await queue.runTick();
      const before = new Map(dlq.list().map((entry) => [entry.id, entry.requestId]));
      const drain = await dlq.drain();
      const remaining = new Set(dlq.list().map((entry) => entry.id));

      const drainedRequestIds: string[] = [];
      for (const [entryId, requestId] of before) {
        if (!remaining.has(entryId)) drainedRequestIds.push(requestId);
      }
      const parkedRequestIds = drain.parked
        .map((entryId) => before.get(entryId))
        .filter((id): id is string => id !== undefined);

      return {
        retries,
        drain,
        drainedRequestIds,
        parkedRequestIds,
        evaluatedAt: now().toISOString(),
      };
    },
    metrics() {
      const jobs = queue.list();
      const entries = dlq.list();
      return {
        ...metrics.snapshot(),
        pendingRetries: jobs.filter((job) => job.status === 'pending').length,
        inFlightRetries: jobs.filter((job) => job.status === 'in-flight').length,
        dlqDepth: entries.length,
        parkedDepth: entries.filter((entry) => dlqEntryStatus(entry) === 'parked').length,
      };
    },
  };
}

let singleton: WebhookRecovery | null = null;

/** Process-wide recovery loop backed by the persistent webhook store. */
export function getWebhookRecovery(): WebhookRecovery {
  if (!singleton) {
    const store = getWebhookStore();
    singleton = createWebhookRecovery({
      retryGateway: store.retryQueueGateway(),
      dlqGateway: store.dlqGateway(),
      adapter: new FetchWebhookDeliveryAdapter(),
    });
  }
  return singleton;
}

/** Reset the singleton (for testing). */
export function resetWebhookRecovery(): void {
  singleton = null;
}
