import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { WebhookConfig } from '../app/webhook-manager';
import { WebhookDeliveryRequest } from './webhook-delivery-worker';
import { getWebhookSigningKeyId, getWebhookSigningSecrets } from './webhook-hmac';
import type { DlqEntry, DlqGateway } from './webhook-dlq';
import type { RetryJob, RetryQueueGateway } from './webhook-retry-queue';

/**
 * Persistent file-based store for webhook configurations, pending deliveries,
 * delivery logs, and signing-secret rotation records.  All mutations are
 * write-through to a JSON file so queued deliveries survive process
 * restarts.
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
const SIGNING_SECRETS_FILE = 'webhook-signing-secrets.json';

export interface DeliveryLogEntry {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
  timestamp: string;
  /** Public key id of the secret that signed this delivery (#1663). */
  signingKeyId?: string;
}

export type WebhookSigningSecretStatus = 'active' | 'grace';

export interface WebhookSigningSecretRecord {
  /** Stable record id. */
  id: string;
  /** Public key identifier derived from the secret material (`key-…`). */
  keyId: string;
  /** The secret material. Server-side only; never returned to clients. */
  secret: string;
  status: WebhookSigningSecretStatus;
  createdAt: string;
  /** When a grace-period secret stops being accepted (ISO string, optional for active). */
  expiresAt?: string;
}

export interface WebhookStoreData {
  configs: WebhookConfig[];
  queue: WebhookDeliveryRequest[];
  deliveryLog: DeliveryLogEntry[];
  deadLetterQueue: DlqEntry[];
  retryQueue: RetryJob[];
  signingSecrets: WebhookSigningSecretRecord[];
}

/** Default grace window for a demoted signing secret (14 days). */
export const DEFAULT_SIGNING_GRACE_TTL_DAYS = 14;

export class WebhookStore {
  private dataDir: string;
  private configs: Map<string, WebhookConfig> = new Map();
  private queue: WebhookDeliveryRequest[] = [];
  private deliveryLog: DeliveryLogEntry[] = [];
  private deadLetterQueue: DlqEntry[] = [];
  private retryQueue: RetryJob[] = [];
  private signingSecrets: WebhookSigningSecretRecord[] = [];
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

  // ─── Signing-secret rotation (#1663) ──────────────────────────────────
  //
  // Secret records (id, key-id, status active|grace, created/expires) live
  // in the store so operators can rotate in the UI without touching env
  // files. On first boot the store seeds itself from the deployment env
  // (`CRASHLAB_WEBHOOK_SIGNING_SECRETS`, first entry active) so existing
  // deployments carry their current secret forward.

  /** Public records; the secret material is never included. */
  listSigningSecretRecords(): Array<Omit<WebhookSigningSecretRecord, 'secret'>> {
    this.pruneExpiredSigningSecrets();
    return this.signingSecrets.map(({ secret: _secret, ...record }) => record);
  }

  /** The active secret record, if any. */
  getActiveSigningSecretRecord(): WebhookSigningSecretRecord | undefined {
    this.pruneExpiredSigningSecrets();
    return this.signingSecrets.find((record) => record.status === 'active');
  }

  /** Secrets accepted for inbound verification: active + unexpired grace. */
  getSigningSecretsForVerification(): string[] {
    this.pruneExpiredSigningSecrets();
    return [
      ...this.signingSecrets.filter((record) => record.status === 'active').map((record) => record.secret),
      ...this.signingSecrets.filter((record) => record.status === 'grace').map((record) => record.secret),
    ];
  }

  /**
   * Rotates the signing secret: the current active record is demoted to
   * grace (reverification only, with a TTL) and a fresh secret becomes
   * active for signing. The new secret is returned exactly once — the
   * caller must surface it to the operator before it is persisted.
   */
  rotateSigningSecret(graceTtlDays?: number): {
    active: WebhookSigningSecretRecord;
    previousKeyId: string | undefined;
  } {
    this.pruneExpiredSigningSecrets();

    const now = new Date();
    const ttlDays = graceTtlDays ?? this.signingGraceTtlDays();
    const previous = this.signingSecrets.find((record) => record.status === 'active');

    const newSecret = randomBytes(32).toString('hex');
    const active: WebhookSigningSecretRecord = {
      id: `sec-${randomBytes(8).toString('hex')}`,
      keyId: getWebhookSigningKeyId(newSecret),
      secret: newSecret,
      status: 'active',
      createdAt: now.toISOString(),
    };

    if (previous) {
      previous.status = 'grace';
      previous.expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    }

    this.signingSecrets.push(active);

    // Order records so the active secret sorts first (visual + first used for
    // signing by the delivery worker).
    this.signingSecrets.sort((a, b) =>
      a.status === 'active' ? -1 : b.status === 'active' ? 1 : a.createdAt.localeCompare(b.createdAt),
    );
    this.saveSigningSecrets();

    return { active, previousKeyId: previous?.keyId };
  }

  /** Immediately revokes a grace-period secret (terminates its window). */
  revokeGraceSigningSecret(idOrKeyId: string): boolean {
    this.pruneExpiredSigningSecrets();
    const before = this.signingSecrets.length;
    this.signingSecrets = this.signingSecrets.filter(
      (record) => record.status !== 'grace' || (record.id !== idOrKeyId && record.keyId !== idOrKeyId),
    );
    if (this.signingSecrets.length !== before) {
      this.saveSigningSecrets();
      return true;
    }
    return false;
  }

  /** Drops grace secrets whose window has lapsed. Returns how many were pruned. */
  pruneExpiredSigningSecrets(nowMs: number = Date.now()): number {
    const before = this.signingSecrets.length;
    this.signingSecrets = this.signingSecrets.filter((record) => {
      if (record.status !== 'grace' || !record.expiresAt) return true;
      return new Date(record.expiresAt).getTime() > nowMs;
    });
    if (this.signingSecrets.length !== before) {
      this.saveSigningSecrets();
    }
    return before - this.signingSecrets.length;
  }

  private signingGraceTtlDays(): number {
    const configured = parseInt(process.env.CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SIGNING_GRACE_TTL_DAYS;
  }

  /** Seeds records from env on first boot — the store is the source of truth afterwards. */
  private seedSigningSecretsFromEnv(): void {
    if (this.signingSecrets.length > 0) return;
    const envSecrets = getWebhookSigningSecrets();
    if (envSecrets.length === 0) return;

    const now = Date.now();
    const ttlDays = this.signingGraceTtlDays();
    envSecrets.forEach((secret, index) => {
      const isActive = index === 0;
      this.signingSecrets.push({
        id: `sec-env-${index}-${randomBytes(4).toString('hex')}`,
        keyId: getWebhookSigningKeyId(secret),
        secret,
        status: isActive ? 'active' : 'grace',
        createdAt: new Date(now).toISOString(),
        ...(isActive ? {} : { expiresAt: new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString() }),
      });
    });
    this.saveSigningSecrets();
  }

  private loadSigningSecrets(): void {
    this.signingSecrets = this.readJson<WebhookSigningSecretRecord[]>(SIGNING_SECRETS_FILE, []);
    this.seedSigningSecretsFromEnv();
  }

  private saveSigningSecrets(): void {
    this.writeJson(SIGNING_SECRETS_FILE, this.signingSecrets);
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
    this.loadSigningSecrets();
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
      signingSecrets: [...this.signingSecrets],
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
