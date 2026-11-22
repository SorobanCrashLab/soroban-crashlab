/**
 * S3-compatible artifact driver (#1433) — AWS S3, Cloudflare R2, MinIO.
 *
 * Uploads and downloads run as presigned URLs so the browser talks to the
 * object store directly; only HEAD and DELETE are issued from the server, both
 * signed with the `Authorization` header flow. All signing is the in-tree
 * SigV4 implementation — no SDK.
 */

import {
  classifyStatus,
  classifyThrow,
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
import type { S3Config } from './env-config';
import {
  presignUrl,
  sha256Hex,
  signRequest,
  toAmzDate,
  uriEncode,
} from './sigv4';

const SERVICE = 's3';

export interface S3DriverOptions {
  config: S3Config;
  /** Injectable for the mocked unit path; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly config: S3Config;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: S3DriverOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  /** `/bucket/key`, with the key's own slashes left intact. */
  private objectPath(key: string): string {
    return `/${uriEncode(this.config.bucket)}/${uriEncode(key, false)}`;
  }

  private scope() {
    return { amzDate: toAmzDate(this.now()), region: this.config.region, service: SERVICE };
  }

  async createUploadTicket(key: string, options: UploadTicketOptions): Promise<UploadTicket> {
    assertKey(key);
    const ttl = options.ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS;
    const expiresAt = ticketExpiry(this.now(), ttl);
    const path = this.objectPath(key);

    if (!needsMultipart(options.sizeBytes)) {
      return {
        kind: 'single',
        key,
        url: presignUrl(
          { method: 'PUT', endpoint: this.config.endpoint, path, expiresInSeconds: ttl },
          this.config.credentials,
          this.scope(),
        ),
        method: 'PUT',
        expiresAt,
      };
    }

    // Multipart: one presigned PUT per part. The upload id is negotiated by
    // the browser against the object store; the driver only signs the parts.
    const total = partCount(options.sizeBytes);
    return {
      kind: 'multipart',
      key,
      partSizeBytes: MULTIPART_PART_SIZE_BYTES,
      parts: Array.from({ length: total }, (_, index) => ({
        partNumber: index + 1,
        url: presignUrl(
          {
            method: 'PUT',
            endpoint: this.config.endpoint,
            path,
            expiresInSeconds: ttl,
            query: { partNumber: String(index + 1) },
          },
          this.config.credentials,
          this.scope(),
        ),
        method: 'PUT' as const,
      })),
      expiresAt,
    };
  }

  async createDownloadTicket(key: string, ttlSeconds?: number): Promise<DownloadTicket> {
    assertKey(key);
    const ttl = ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS;
    return {
      key,
      url: presignUrl(
        {
          method: 'GET',
          endpoint: this.config.endpoint,
          path: this.objectPath(key),
          expiresInSeconds: ttl,
        },
        this.config.credentials,
        this.scope(),
      ),
      method: 'GET',
      expiresAt: ticketExpiry(this.now(), ttl),
    };
  }

  async exists(key: string): Promise<boolean> {
    assertKey(key);
    const response = await this.send('HEAD', key);

    if (response.status === 404) return false;
    if (!response.ok) throw this.toError('HEAD', response.status);
    return true;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const response = await this.send('DELETE', key);

    // S3 answers 204 for a delete, and treats deleting a missing key as success.
    if (response.ok || response.status === 404) return;
    throw this.toError('DELETE', response.status);
  }

  /** Signed server-side request; the payload is always empty for HEAD/DELETE. */
  private async send(method: 'HEAD' | 'DELETE', key: string): Promise<Response> {
    const scope = this.scope();
    const path = this.objectPath(key);
    const host = new URL(this.config.endpoint).host;
    const payloadHash = sha256Hex('');

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': scope.amzDate,
    };
    if (this.config.credentials.sessionToken) {
      headers['x-amz-security-token'] = this.config.credentials.sessionToken;
    }

    const signed = signRequest(
      { method, path, query: {}, headers, payloadHash },
      this.config.credentials,
      scope,
    );

    try {
      return await this.fetchImpl(`${this.config.endpoint}${path}`, {
        method,
        headers: { ...headers, Authorization: signed.authorization },
      });
    } catch (error) {
      throw classifyThrow(error);
    }
  }

  private toError(operation: string, status: number): StorageError {
    return new StorageError(
      `S3 ${operation} failed with status ${status}`,
      classifyStatus(status),
      status,
    );
  }
}

function assertKey(key: string): void {
  if (!key.trim()) {
    throw new StorageError('Artifact key must not be empty', 'permanent', 400);
  }
}
