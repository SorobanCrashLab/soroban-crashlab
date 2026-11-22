/**
 * Artifact blob storage contract (#1433).
 *
 * Drivers hand out presigned tickets rather than proxying bytes: the dashboard
 * asks for a ticket, the browser talks to the object store directly, and the
 * driver verifies afterwards that the object landed. Credentials therefore
 * never leave the server.
 */

/** Artifacts above this size are uploaded in parts rather than one PUT. */
export const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024;

/** Default part size for multipart uploads (S3 minimum is 5 MiB). */
export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;

export const DEFAULT_TICKET_TTL_SECONDS = 900;

/**
 * Transient failures are worth retrying (and are compatible with the
 * dead-letter queue's retry lifecycle); permanent ones never will be.
 */
export type StorageFailureKind = 'transient' | 'permanent';

export class StorageError extends Error {
  readonly kind: StorageFailureKind;
  readonly statusCode?: number;

  constructor(message: string, kind: StorageFailureKind, statusCode?: number) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

/**
 * 408/429 and 5xx are the retryable classes; every other 4xx describes a
 * request that will fail the same way next time.
 */
export function classifyStatus(status: number): StorageFailureKind {
  if (status === 408 || status === 429) return 'transient';
  if (status >= 500) return 'transient';
  return 'permanent';
}

/** A network-level throw (DNS, socket, abort) is always transient. */
export function classifyThrow(error: unknown): StorageError {
  return new StorageError(
    error instanceof Error ? error.message : String(error),
    'transient',
  );
}

export interface SingleUploadTicket {
  kind: 'single';
  key: string;
  url: string;
  method: 'PUT';
  expiresAt: string;
}

export interface MultipartUploadTicket {
  kind: 'multipart';
  key: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; url: string; method: 'PUT' }>;
  expiresAt: string;
}

export type UploadTicket = SingleUploadTicket | MultipartUploadTicket;

export interface DownloadTicket {
  key: string;
  url: string;
  method: 'GET';
  expiresAt: string;
}

export interface UploadTicketOptions {
  sizeBytes: number;
  ttlSeconds?: number;
  contentType?: string;
}

export interface StorageDriver {
  /** Stable identifier, surfaced in diagnostics. */
  readonly name: string;
  createUploadTicket(key: string, options: UploadTicketOptions): Promise<UploadTicket>;
  createDownloadTicket(key: string, ttlSeconds?: number): Promise<DownloadTicket>;
  /** HEAD-equivalent: did the browser's upload actually land? */
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function ticketExpiry(now: Date, ttlSeconds: number): string {
  return new Date(now.getTime() + ttlSeconds * 1000).toISOString();
}

/** Whether an artifact of this size needs the multipart path. */
export function needsMultipart(sizeBytes: number): boolean {
  return sizeBytes > MULTIPART_THRESHOLD_BYTES;
}

export function partCount(sizeBytes: number, partSizeBytes = MULTIPART_PART_SIZE_BYTES): number {
  return Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
}
