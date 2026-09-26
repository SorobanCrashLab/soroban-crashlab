import * as fs from 'fs';
import * as path from 'path';
import { WebhookConfig } from '../app/webhook-manager';
import { WebhookDeliveryRequest } from './webhook-delivery-worker';
import type { DlqEntry, DlqGateway } from './webhook-dlq';
import type { RetryJob, RetryQueueGateway } from './webhook-retry-queue';

/**
 * Persistent file-based store for webhook configurations, pending deliveries,
 * and delivery logs.  All mutations are write-through to a JSON file so
 * queued deliveries survive process restarts.
 *
 * The store is safe for single-process use (Next.js default).  It uses
 * synchronous writes to guarantee the file is up-to-date before returning.
 */

const DEFAULT_DATA_DIR = path.join(process.cwd(), '.webhook-data');
const CONFIGS_FILE = 'webhook-configs.json';
const QUEUE_FILE = 'webhook-delivery-queue.json';
const DELIVERY_LOG_FILE = 'webhook-delivery-log.json';
const DLQ_FILE = 'webhook-dead-letter-queue.json';
const RETRY_QUEUE_FILE = 'webhook-retry-queue.json';

export interface DeliveryLogEntry {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
  timestamp: string;
}

export interface WebhookStoreData {
  configs: WebhookConfig[];
  queue: WebhookDeliveryRequest[];
  deliveryLog: DeliveryLogEntry[];
  deadLetterQueue: DlqEntry[];
  retryQueue: RetryJob[];
}

export class WebhookStore {
  private dataDir: string;
  private configs: Map<string, WebhookConfig> = new Map();
  private queue: WebhookDeliveryRequest[] = [];
  private deliveryLog: DeliveryLogEntry[] = [];
  private deadLetterQueue: DlqEntry[] = [];
  private retryQueue: RetryJob[] = [];
  private maxLogSize: number;

  constructor(dataDir?: string, maxLogSize: number = 10000) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.maxLogSize = maxLogSize;
    this.ensureDataDir();
    this.loadAll();
  }

  // ─── Config operations ────────────────────────────────────────────────

  getConfig(id: string): WebhookConfig | undefined {
    return this.configs.get(id);
  }

  getAllConfigs(): WebhookConfig[] {
    return Array.from(this.configs.values());
  }

  setConfig(config: WebhookConfig): void {
    this.configs.set(config.id, config);
    this.saveConfigs();
  }

  deleteConfig(id: string): boolean {
    const deleted = this.configs.delete(id);
    if (deleted) this.saveConfigs();
    return deleted;
  }

  hasConfig(id: string): boolean {
    return this.configs.has(id);
  }

  // ─── Queue operations ─────────────────────────────────────────────────

  getQueue(): WebhookDeliveryRequest[] {
    return [...this.queue];
  }

  enqueue(request: WebhookDeliveryRequest): void {
    this.queue.push(request);
    this.saveQueue();
  }

  dequeue(): WebhookDeliveryRequest | undefined {
    const item = this.queue.shift();
    if (item) this.saveQueue();
    return item;
  }

  removeFromQueue(id: string): boolean {
    const before = this.queue.length;
    this.queue = this.queue.filter((r) => r.id !== id);
    if (this.queue.length !== before) {
      this.saveQueue();
      return true;
    }
    return false;
  }

  queueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
  }

  // ─── Delivery log operations ──────────────────────────────────────────

  getDeliveryLog(webhookId?: string, limit: number = 100): DeliveryLogEntry[] {
    let entries = this.deliveryLog;
    if (webhookId) {
      entries = entries.filter((e) => e.webhookId === webhookId);
    }
    return entries.slice(-limit).reverse();
  }

  addDeliveryLog(entry: DeliveryLogEntry): void {
    this.deliveryLog.push(entry);
    if (this.deliveryLog.length > this.maxLogSize) {
      this.deliveryLog = this.deliveryLog.slice(-this.maxLogSize);
    }
    this.saveDeliveryLog();
  }

  clearDeliveryLog(): void {
    this.deliveryLog = [];
    this.saveDeliveryLog();
  }

  pruneDeliveryLog(params?: { ttlDays?: number; maxBatchSize?: number; nowMs?: number }): { prunedCount: number } {
    const ttlDays = params?.ttlDays ?? parseInt(process.env.WEBHOOK_HISTORY_RETENTION_DAYS ?? '30', 10);
    if (ttlDays <= 0) {
      return { prunedCount: 0 };
    }

    const nowMs = params?.nowMs ?? Date.now();
    const cutoffMs = nowMs - ttlDays * 24 * 60 * 60 * 1000;
    const maxBatchSize = params?.maxBatchSize ?? 1000;

    let prunedCount = 0;
    const newLog: DeliveryLogEntry[] = [];

    for (const entry of this.deliveryLog) {
      const entryTime = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (entryTime > 0 && entryTime < cutoffMs && prunedCount < maxBatchSize) {
        prunedCount++;
      } else {
        newLog.push(entry);
      }
    }

    if (prunedCount > 0) {
      this.deliveryLog = newLog;
      this.saveDeliveryLog();
    }

    return { prunedCount };
  }

  // ─── Dead-letter queue operations ─────────────────────────────────────
  //
  // Terminal delivery failures land here (#1427). Write-through like the rest
  // of the store, so a silently failing endpoint is still visible after a
  // restart.

  getDeadLetterQueue(): DlqEntry[] {
    return [...this.deadLetterQueue];
  }

  setDeadLetterQueue(entries: readonly DlqEntry[]): void {
    this.deadLetterQueue = [...entries];
    this.saveDeadLetterQueue();
  }

  deadLetterDepth(): number {
    return this.deadLetterQueue.length;
  }

  /** Gateway view of the DLQ, for `DeadLetterQueue` to read and write. */
  dlqGateway(): DlqGateway {
    return {
      load: () => this.getDeadLetterQueue(),
      save: (entries) => this.setDeadLetterQueue(entries),
    };
  }

  // ─── Retry queue operations ───────────────────────────────────────────
  //
  // Scheduled retry attempts (#1635). Persisted so a retry survives the
  // function that scheduled it; the webhook-recovery tick executes them.

  getRetryQueue(): RetryJob[] {
    return [...this.retryQueue];
  }

  setRetryQueue(jobs: readonly RetryJob[]): void {
    this.retryQueue = [...jobs];
    this.saveRetryQueue();
  }

  /** Gateway view of the retry queue, for `WebhookRetryQueue` to read and write. */
  retryQueueGateway(): RetryQueueGateway {
    return {
      load: () => this.getRetryQueue(),
      save: (jobs) => this.setRetryQueue(jobs),
    };
  }

  // ─── Bulk / startup ───────────────────────────────────────────────────

  loadAll(): void {
    this.configs = new Map();
    this.queue = [];
    this.deliveryLog = [];
    this.deadLetterQueue = [];
    this.retryQueue = [];

    this.loadConfigs();
    this.loadQueue();
    this.loadDeliveryLog();
    this.loadDeadLetterQueue();
    this.loadRetryQueue();
  }

  /**
   * Returns all data for serialisation / snapshot.
   */
  snapshot(): WebhookStoreData {
    return {
      configs: this.getAllConfigs(),
      queue: this.getQueue(),
      deliveryLog: [...this.deliveryLog],
      deadLetterQueue: this.getDeadLetterQueue(),
      retryQueue: this.getRetryQueue(),
    };
  }

  // ─── File I/O (private) ───────────────────────────────────────────────

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private filePath(name: string): string {
    return path.join(this.dataDir, name);
  }

  private readJson<T>(name: string, fallback: T): T {
    const p = this.filePath(name);
    try {
      if (!fs.existsSync(p)) return fallback;
      const raw = fs.readFileSync(p, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(name: string, data: unknown): void {
    const p = this.filePath(name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  }

  private loadConfigs(): void {
    const arr = this.readJson<WebhookConfig[]>(CONFIGS_FILE, []);
    for (const cfg of arr) {
      this.configs.set(cfg.id, cfg);
    }
  }

  private saveConfigs(): void {
    this.writeJson(CONFIGS_FILE, this.getAllConfigs());
  }

  private loadQueue(): void {
    this.queue = this.readJson<WebhookDeliveryRequest[]>(QUEUE_FILE, []);
  }

  private saveQueue(): void {
    this.writeJson(QUEUE_FILE, this.queue);
  }

  private loadDeliveryLog(): void {
    this.deliveryLog = this.readJson<DeliveryLogEntry[]>(DELIVERY_LOG_FILE, []);
  }

  private saveDeliveryLog(): void {
    this.writeJson(DELIVERY_LOG_FILE, this.deliveryLog);
  }

  private loadDeadLetterQueue(): void {
    this.deadLetterQueue = this.readJson<DlqEntry[]>(DLQ_FILE, []);
  }

  private saveDeadLetterQueue(): void {
    this.writeJson(DLQ_FILE, this.deadLetterQueue);
  }

  private loadRetryQueue(): void {
    this.retryQueue = this.readJson<RetryJob[]>(RETRY_QUEUE_FILE, []);
  }

  private saveRetryQueue(): void {
    this.writeJson(RETRY_QUEUE_FILE, this.retryQueue);
  }
}

/**
 * Singleton store instance shared across the application.
 * In production the Next.js server process holds this in module scope.
 */
let _singleton: WebhookStore | null = null;

export function getWebhookStore(dataDir?: string): WebhookStore {
  if (!_singleton) {
    _singleton = new WebhookStore(dataDir);
  }
  return _singleton;
}

/** Reset the singleton (for testing). */
export function resetWebhookStore(): void {
  _singleton = null;
}
