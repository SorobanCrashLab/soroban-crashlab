import { WebhookStore } from "./webhook-store";
import {
  createDlqEntry,
  type DlqAttemptNote,
  type DlqEntry,
} from "./webhook-dlq";
import type { WebhookRetryQueue } from "./webhook-retry-queue";
import {
  createWebhookSignature,
  getWebhookSigningKeyId,
  getWebhookSigningSecrets,
  verifyWebhookSignatureSync,
} from "./webhook-hmac";

export type HmacKeyRing = {
  current: string;
  previous?: string;
};

export function createHmacSignature(
  payload: string,
  secret: string,
  timestamp: string = String(Math.floor(Date.now() / 1000)),
): string {
  return createWebhookSignature(payload, secret, timestamp);
}

export function verifyHmacSignature(
  payload: string,
  signature: string,
  secrets: string[],
  timestampHeader?: string,
): boolean {
  return verifyWebhookSignatureSync(
    payload,
    signature,
    secrets,
    300,
    timestampHeader,
  );
}

export function verifyHmacWithKeyRing(
  payload: string,
  signature: string,
  ring: HmacKeyRing,
): boolean {
  const secrets = [ring.current, ...(ring.previous ? [ring.previous] : [])];
  return verifyHmacSignature(payload, signature, secrets);
}

export type WebhookDeliveryStatus = "queued" | "delivered" | "failed";

export interface WebhookDeliveryRequest {
  id: string;
  url: string;
  eventType: string;
  payload: unknown;
  headers?: Record<string, string>;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface WebhookDeliveryAttempt {
  requestId: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
}

export interface WebhookDeliveryAdapter {
  deliver(request: WebhookDeliveryRequest): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
  }>;
}

export interface WebhookDeliveryWorkerOptions {
  adapter?: WebhookDeliveryAdapter;
  store?: WebhookStore;
  maxAttempts?: number;
  retryBaseMs?: number;
  timeoutMs?: number;
  now?: () => Date;
  delay?: (ms: number) => Promise<void>;
  onAttempt?: (attempt: WebhookDeliveryAttempt) => void;
  /**
   * Called once a delivery fails terminally — retries exhausted, or a status
   * code that is not worth retrying. The entry carries the request and the
   * full error timeline so the dead-letter queue can replay it later.
   */
  onDeadLetter?: (entry: DlqEntry) => void;
  hmacSecrets?: string[];
  hmacKeyRing?: HmacKeyRing;
  /**
   * Durable retry queue (#1635). When set, a retryable failure is persisted
   * as a queued job for the webhook-recovery tick instead of being retried
   * inline with in-process sleeps that die with the serverless function.
   */
  retryQueue?: WebhookRetryQueue;
}

/**
 * Network errors (no status), 429 and 5xx are worth another attempt; any
 * other status will fail the same way next time.
 */
export function isRetryableDeliveryStatus(statusCode?: number): boolean {
  if (statusCode === undefined) return true;
  if (statusCode === 429) return true;
  return statusCode >= 500;
}

import {
  WEBHOOK_DELIVERY_TIMEOUT_MS,
  WEBHOOK_DELIVERY_RETRY_BASE_MS,
} from "./timeouts";

const DEFAULT_MAX_ATTEMPTS = 3;

export class FetchWebhookDeliveryAdapter implements WebhookDeliveryAdapter {
  private readonly hmacSecrets: readonly string[];

  constructor(
    hmacSecrets: string | readonly string[] = getWebhookSigningSecrets(),
  ) {
    this.hmacSecrets =
      typeof hmacSecrets === "string" ? [hmacSecrets] : hmacSecrets;
  }

  async deliver(request: WebhookDeliveryRequest): Promise<{
    ok: boolean;
    statusCode?: number;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      request.timeoutMs ?? WEBHOOK_DELIVERY_TIMEOUT_MS,
    );

    try {
      const payload = JSON.stringify(request.payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Event": request.eventType,
      };
      if (request.headers) {
        Object.assign(headers, request.headers);
      }
      const activeSecret = this.hmacSecrets[0];
      if (activeSecret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        headers["X-Webhook-Timestamp"] = timestamp;
        headers["X-Webhook-Key-Id"] = getWebhookSigningKeyId(activeSecret);
        headers["X-Webhook-Signature"] = createHmacSignature(
          payload,
          activeSecret,
          timestamp,
        );
      }
      const response = await fetch(request.url, {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });

      return {
        ok: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class WebhookDeliveryWorker {
  private readonly adapter: WebhookDeliveryAdapter;
  private readonly store: WebhookStore | null;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly onAttempt?: (attempt: WebhookDeliveryAttempt) => void;
  private readonly onDeadLetter?: (entry: DlqEntry) => void;
  private readonly hmacSecrets: string[];
  private readonly retryQueue?: WebhookRetryQueue;
  private readonly queue: WebhookDeliveryRequest[] = [];
  private active = false;
  private draining: Promise<void> | null = null;

  constructor(options: WebhookDeliveryWorkerOptions = {}) {
    const ringSecrets = options.hmacKeyRing
      ? [
          options.hmacKeyRing.current,
          ...(options.hmacKeyRing.previous
            ? [options.hmacKeyRing.previous]
            : []),
        ]
      : [];
    const secrets =
      options.hmacSecrets ??
      (ringSecrets.length > 0 ? ringSecrets : getWebhookSigningSecrets());
    this.hmacSecrets = secrets;
    if (!options.adapter && secrets.length > 0) {
      this.adapter = new FetchWebhookDeliveryAdapter(secrets);
    } else {
      this.adapter =
        options.adapter ?? new FetchWebhookDeliveryAdapter(secrets);
    }
    this.store = options.store ?? null;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = options.retryBaseMs ?? WEBHOOK_DELIVERY_RETRY_BASE_MS;
    this.timeoutMs = options.timeoutMs ?? WEBHOOK_DELIVERY_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
    this.delay =
      options.delay ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onAttempt = options.onAttempt;
    this.onDeadLetter = options.onDeadLetter;
    this.retryQueue = options.retryQueue;
  }

  getHmacSecrets(): string[] {
    return [...this.hmacSecrets];
  }

  signPayload(payload: unknown): string | null {
    if (this.hmacSecrets.length === 0) return null;
    return createHmacSignature(JSON.stringify(payload), this.hmacSecrets[0]);
  }

  verifyPayload(payload: unknown, signature: string): boolean {
    if (this.hmacSecrets.length === 0) return false;
    return verifyHmacSignature(
      JSON.stringify(payload),
      signature,
      this.hmacSecrets,
    );
  }

  enqueue(request: WebhookDeliveryRequest): void {
    this.assertRequest(request);
    const enriched = {
      ...request,
      timeoutMs: request.timeoutMs ?? this.timeoutMs,
    };
    this.queue.push(enriched);

    if (this.store) {
      this.store.enqueue(enriched);
    }

    if (this.active) {
      void this.drain();
    }
  }

  /**
   * Load any pending deliveries from the persistent store and re-enqueue
   * them.  Called on startup so that queued deliveries survive restarts.
   */
  recoverPendingDeliveries(): void {
    if (!this.store) return;

    const pending = this.store.getQueue();
    for (const request of pending) {
      // Avoid duplicating items already in the in-memory queue
      if (!this.queue.some((q) => q.id === request.id)) {
        this.queue.push(request);
      }
    }
  }

  start(): void {
    if (this.active) {
      return;
    }

    this.recoverPendingDeliveries();
    this.active = true;
    void this.drain();
  }

  stop(): void {
    this.active = false;
  }

  size(): number {
    return this.queue.length;
  }

  async drain(): Promise<void> {
    if (this.draining) {
      return this.draining;
    }

    this.draining = this.processQueue();

    try {
      await this.draining;
    } finally {
      this.draining = null;
    }
  }

  private async processQueue(): Promise<void> {
    while (this.active && this.queue.length > 0) {
      const request = this.queue.shift()!;

      if (this.store) {
        this.store.removeFromQueue(request.id);
      }

      await this.deliverWithRetries(request);
    }
  }

  private async deliverWithRetries(
    request: WebhookDeliveryRequest,
  ): Promise<void> {
    const maxAttempts = request.maxAttempts ?? this.maxAttempts;
    const timeline: DlqAttemptNote[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.adapter.deliver(request);
      const delivered = result.ok;
      const finalAttempt = attempt === maxAttempts;
      const willRetry =
        !delivered && !finalAttempt && this.shouldRetry(result.statusCode);

      const attemptRecord: WebhookDeliveryAttempt = {
        requestId: request.id,
        attempt,
        status: delivered ? "delivered" : willRetry ? "queued" : "failed",
        statusCode: result.statusCode,
        error: result.error,
        deliveredAt: this.now().toISOString(),
      };

      this.recordAttempt(attemptRecord);

      if (this.store && (delivered || !willRetry)) {
        this.store.addDeliveryLog({
          webhookId: request.id,
          success: delivered,
          statusCode: result.statusCode,
          error: result.error,
          retryCount: attempt - 1,
          timestamp: attemptRecord.deliveredAt,
        });
      }

      if (!delivered) {
        timeline.push({
          attempt,
          statusCode: result.statusCode,
          error: result.error ?? "Delivery failed",
          at: attemptRecord.deliveredAt,
        });
      }

      if (willRetry && this.retryQueue) {
        this.retryQueue.schedule({
          // Carry the worker's budget so the queue stops where inline retries would have.
          request: { ...request, maxAttempts },
          attemptsMade: attempt,
          timeline,
          createdAt: timeline[0]?.at,
        });
        return;
      }

      if (!willRetry) {
        if (!delivered) {
          this.deadLetter(
            request,
            timeline,
            attempt === maxAttempts,
            attemptRecord.deliveredAt,
          );
        }
        return;
      }

      await this.delay(this.retryDelayMs(attempt));
    }
  }

  /**
   * Hands a terminal failure to the dead-letter queue. `exhausted` separates
   * "we tried the whole budget" from "this status code was never going to
   * succeed", which is what the queue's reason filter reads.
   */
  private deadLetter(
    request: WebhookDeliveryRequest,
    timeline: DlqAttemptNote[],
    exhausted: boolean,
    at: string,
  ): void {
    if (!this.onDeadLetter) return;

    this.onDeadLetter(
      createDlqEntry({
        request,
        timeline,
        reason: exhausted ? "retries-exhausted" : "non-retryable",
        now: at,
      }),
    );
  }

  private shouldRetry(statusCode?: number): boolean {
    return isRetryableDeliveryStatus(statusCode);
  }

  private retryDelayMs(attempt: number): number {
    return this.retryBaseMs * 2 ** (attempt - 1);
  }

  private recordAttempt(attempt: WebhookDeliveryAttempt): void {
    this.onAttempt?.(attempt);
  }

  private assertRequest(request: WebhookDeliveryRequest): void {
    if (!request.id.trim()) {
      throw new Error("Webhook delivery request requires an id");
    }

    try {
      const url = new URL(request.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      throw new Error(`Invalid webhook URL: ${request.url}`);
    }

    if (!request.eventType.trim()) {
      throw new Error("Webhook delivery request requires an event type");
    }
  }
}

export function createWebhookDeliveryWorker(
  options?: WebhookDeliveryWorkerOptions,
): WebhookDeliveryWorker {
  return new WebhookDeliveryWorker(options);
}
