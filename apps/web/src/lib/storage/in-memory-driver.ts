/**
 * Default artifact driver (#1433): keeps blobs in process memory and hands out
 * `data:`-free local tickets. This remains the default so that nothing changes
 * for deployments that have not configured an object store.
 */

import {
  DEFAULT_TICKET_TTL_SECONDS,
  MULTIPART_PART_SIZE_BYTES,
  needsMultipart,
  partCount,
  StorageError,
  ticketExpiry,
  type DownloadTicket,
  type StorageDriver,
  type UploadTicket,
  type UploadTicketOptions,
} from './driver';

export interface InMemoryDriverOptions {
  now?: () => Date;
  /** Base URL the fake tickets point at. */
  baseUrl?: string;
}

export class InMemoryStorageDriver implements StorageDriver {
  readonly name = 'in-memory';
  private readonly objects = new Map<string, number>();
  private readonly now: () => Date;
  private readonly baseUrl: string;

  constructor(options: InMemoryDriverOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.baseUrl = options.baseUrl ?? 'https://in-memory.local';
  }

  async createUploadTicket(key: string, options: UploadTicketOptions): Promise<UploadTicket> {
    assertKey(key);
    const ttl = options.ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS;
    const expiresAt = ticketExpiry(this.now(), ttl);

    // Recorded on ticket issue so `exists` can answer without a real upload.
    this.objects.set(key, options.sizeBytes);

    if (!needsMultipart(options.sizeBytes)) {
      return { kind: 'single', key, url: `${this.baseUrl}/${key}`, method: 'PUT', expiresAt };
    }

    const total = partCount(options.sizeBytes);
    return {
      kind: 'multipart',
      key,
      partSizeBytes: MULTIPART_PART_SIZE_BYTES,
      parts: Array.from({ length: total }, (_, index) => ({
        partNumber: index + 1,
        url: `${this.baseUrl}/${key}?partNumber=${index + 1}`,
        method: 'PUT' as const,
      })),
      expiresAt,
    };
  }

  async createDownloadTicket(key: string, ttlSeconds?: number): Promise<DownloadTicket> {
    assertKey(key);
    if (!this.objects.has(key)) {
      throw new StorageError(`No artifact stored at ${key}`, 'permanent', 404);
    }
    return {
      key,
      url: `${this.baseUrl}/${key}`,
      method: 'GET',
      expiresAt: ticketExpiry(this.now(), ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS),
    };
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    this.objects.delete(key);
  }
}

function assertKey(key: string): void {
  if (!key.trim()) {
    throw new StorageError('Artifact key must not be empty', 'permanent', 400);
  }
}
