/**
 * Webhook Manager for Run Events
 *
 * Manages webhook subscriptions and event delivery for run lifecycle events.
 * Supports deterministic setup, observable failures, and explicit success criteria.
 *
 * Issue #414: Integrate Webhook manager for run events
 */

import { FuzzingRun, RunStatus } from './types';

/**
 * Supported run event types for webhook delivery.
 */
export type RunEventType =
  | 'run.started'
  | 'run.progressing'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'crash.detected';

/**
 * Configuration for a webhook endpoint.
 */
export interface WebhookConfig {
  /** Unique identifier for this webhook */
  id: string;
  /** URL to send events to */
  url: string;
  /** Event types this webhook is subscribed to */
  events: RunEventType[];
  /** HTTP headers to include with requests */
  headers?: Record<string, string>;
  /** Maximum retries for failed deliveries */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether this webhook is active */
  active: boolean;
  /** Authentication token/secret for the webhook */
  secret?: string;
}

/**
 * Webhook delivery event payload.
 */
export interface WebhookEvent {
  /** Event type identifier */
  eventType: RunEventType;
  /** Timestamp of the event */
  timestamp: string;
  /** UUID for tracking this specific event delivery */
  eventId: string;
  /** The run that triggered this event */
  run: FuzzingRun;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Result of a webhook delivery attempt.
 */
export interface WebhookDeliveryResult {
  /** Webhook configuration ID */
  webhookId: string;
  /** Whether delivery was successful */
  success: boolean;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Error message if delivery failed */
  error?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Timestamp of the delivery attempt */
  timestamp: string;
}

/**
 * WebhookManager handles subscription and event delivery for run events.
 *
 * ## Design Goals
 * - Deterministic setup: webhooks configured upfront, no runtime discovery
 * - Observable failures: all delivery results tracked and queryable
 * - Explicit success: delivery status is verifiable without manual inspection
 * - Configuration validation: URL formatting, event types, etc.
 * - Failure recovery: exponential backoff and retry logic
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveryLog: WebhookDeliveryResult[] = [];
  private maxLogSize: number = 10000;
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient || new DefaultHttpClient();
  }

  /**
   * Register a webhook configuration.
   *
   * @param config The webhook configuration to register
   * @throws Error if URL is invalid or webhook ID already exists
   */
  registerWebhook(config: WebhookConfig): void {
    if (!this.isValidUrl(config.url)) {
      throw new Error(`Invalid webhook URL: ${config.url}`);
    }

    if (this.webhooks.has(config.id)) {
      throw new Error(`Webhook with ID ${config.id} already exists`);
    }

    if (config.events.length === 0) {
      throw new Error('Webhook must subscribe to at least one event type');
    }

    this.webhooks.set(config.id, {
      ...config,
      maxRetries: config.maxRetries ?? 3,
      timeoutMs: config.timeoutMs ?? 5000,
    });
  }

  /**
   * Unregister a webhook by ID.
   *
   * @param webhookId The ID of the webhook to remove
   * @returns true if webhook was removed, false if not found
   */
  unregisterWebhook(webhookId: string): boolean {
    return this.webhooks.delete(webhookId);
  }

  /**
   * Get all registered webhooks.
   */
  getWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get a specific webhook by ID.
   */
  getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Dispatch a run event to all subscribed webhooks.
   *
   * Sends events asynchronously with retry logic for failed deliveries.
   * Results are tracked in the delivery log for monitoring.
   *
   * @param run The run that triggered the event
   * @param eventType The type of event to dispatch
   * @param context Optional additional context
   * @returns Array of delivery results
   */
  async dispatchEvent(
    run: FuzzingRun,
    eventType: RunEventType,
    context?: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    const results: WebhookDeliveryResult[] = [];
    const event = this.createEvent(run, eventType, context);

    for (const webhook of this.webhooks.values()) {
      if (!webhook.active) {
        continue;
      }

      if (!webhook.events.includes(eventType)) {
        continue;
      }

      const result = await this.deliverEvent(webhook, event);
      results.push(result);
      this.addToLog(result);
    }

    return results;
  }

  /**
   * Dispatch run status change events automatically.
   *
   * Maps run status to appropriate event types and dispatches to subscribed webhooks.
   */
  async dispatchStatusChange(
    run: FuzzingRun,
    previousStatus?: RunStatus,
  ): Promise<WebhookDeliveryResult[]> {
    const eventTypeMap: Record<RunStatus, RunEventType> = {
      running: 'run.started',
      completed: 'run.completed',
      failed: 'run.failed',
      cancelled: 'run.cancelled',
    };

    const eventType = eventTypeMap[run.status];
    const context = previousStatus ? { previousStatus } : undefined;

    return this.dispatchEvent(run, eventType, context);
  }

  /**
   * Get delivery results for a specific webhook.
   *
   * @param webhookId The webhook ID to query
   * @param limit Maximum number of results to return
   * @returns Recent delivery results, newest first
   */
  getDeliveryLog(webhookId?: string, limit: number = 100): WebhookDeliveryResult[] {
    let results = this.deliveryLog;

    if (webhookId) {
      results = results.filter((r) => r.webhookId === webhookId);
    }

    return results.slice(-limit).reverse();
  }

  /**
   * Clear the delivery log (useful for testing).
   */
  clearDeliveryLog(): void {
    this.deliveryLog = [];
  }

  /**
   * Get statistics about webhook delivery success rate.
   */
  getDeliveryStats(webhookId?: string): {
    totalAttempts: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number;
  } {
    let results = this.deliveryLog;

    if (webhookId) {
      results = results.filter((r) => r.webhookId === webhookId);
    }

    const totalAttempts = results.length;
    const successfulDeliveries = results.filter((r) => r.success).length;
    const failedDeliveries = totalAttempts - successfulDeliveries;
    const successRate = totalAttempts > 0 ? successfulDeliveries / totalAttempts : 0;

    return {
      totalAttempts,
      successfulDeliveries,
      failedDeliveries,
      successRate,
    };
  }

  /**
   * Validate all registered webhooks by attempting a test delivery.
   *
   * @returns Map of webhook ID to validation results
   */
  async validateWebhooks(): Promise<Record<string, { valid: boolean; error?: string }>> {
    const results: Record<string, { valid: boolean; error?: string }> = {};

    for (const webhook of this.webhooks.values()) {
      try {
        const response = await this.httpClient.fetch(webhook.url, {
          method: 'HEAD',
          timeout: webhook.timeoutMs!,
        });

        if (response.ok) {
          results[webhook.id] = { valid: true };
        } else {
          results[webhook.id] = {
            valid: false,
            error: `HTTP ${response.status}`,
          };
        }
      } catch (error) {
        results[webhook.id] = {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private methods
  // ═══════════════════════════════════════════════════════════════════════════

  private async deliverEvent(
    webhook: WebhookConfig,
    event: WebhookEvent,
  ): Promise<WebhookDeliveryResult> {
    let lastError: Error | undefined;
    let lastStatusCode: number | undefined;

    for (let attempt = 0; attempt <= webhook.maxRetries!; attempt++) {
      try {
        const response = await this.httpClient.fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...webhook.headers,
          },
          body: JSON.stringify(event),
          timeout: webhook.timeoutMs!,
        });

        if (response.ok) {
          return {
            webhookId: webhook.id,
            success: true,
            statusCode: response.status,
            retryCount: attempt,
            timestamp: new Date().toISOString(),
          };
        }

        lastStatusCode = response.status;
        lastError = new Error(`HTTP ${response.status}`);

        // Don't retry on 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on a few selected errors
        if (attempt === webhook.maxRetries!) {
          break;
        }

        // Exponential backoff
        const backoffMs = 100 * Math.pow(2, attempt);
        await this.sleep(backoffMs);
      }
    }

    return {
      webhookId: webhook.id,
      success: false,
      statusCode: lastStatusCode,
      error: lastError?.message || 'Unknown error',
      retryCount: webhook.maxRetries!,
      timestamp: new Date().toISOString(),
    };
  }

  private createEvent(
    run: FuzzingRun,
    eventType: RunEventType,
    context?: Record<string, unknown>,
  ): WebhookEvent {
    return {
      eventType,
      timestamp: new Date().toISOString(),
      eventId: this.generateEventId(),
      run,
      context,
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private addToLog(result: WebhookDeliveryResult): void {
    this.deliveryLog.push(result);

    // Keep log size bounded
    if (this.deliveryLog.length > this.maxLogSize) {
      this.deliveryLog = this.deliveryLog.slice(-this.maxLogSize);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * HTTP client interface for testability.
 */
export interface HttpClient {
  fetch(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ): Promise<{
    ok: boolean;
    status: number;
  }>;
}

/**
 * Default HTTP client using fetch API.
 */
class DefaultHttpClient implements HttpClient {
  async fetch(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ): Promise<{ ok: boolean; status: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      return {
        ok: response.ok,
        status: response.status,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { DefaultHttpClient };
