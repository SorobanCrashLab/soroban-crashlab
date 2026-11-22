/**
 * Storage driver conformance suite (#1830).
 *
 * One behavioral contract — TTL expiry precision, atomicity, error taxonomy,
 * streaming read equivalence and concurrent access safety — executed against
 * every storage backend: the in-memory artifact store, a live Redis KV backend
 * (enabled by `CRASHLAB_REDIS_URL` or `REDIS_URL`) and live MinIO
 * (`CRASHLAB_S3_*`, exercised nightly by `.github/workflows/storage-minio.yml`).
 *
 * The Rust sibling (`contracts/crashlab-core/tests/storage_conformance.rs`)
 * defines the reference semantics for in-process backends; this file carries
 * the same contract to the backends whose clients only exist on the web side.
 * Object-level TTL is a Rust-side capability; here TTL is carried by
 * upload/download tickets, so the TTL dimension conforms the ticket surfaces.
 *
 * Fault injection is part of the contract: a write killed mid-flight must
 * surface as a retryable failure and leave no partial state, and a torn
 * (half-written) artifact must surface as a typed corruption failure rather
 * than a silently truncated payload.
 *
 * Policy: a conformance failure is a bug in the backend (or an explicitly
 * documented waiver tracked by its own issue), never a reason to weaken the
 * suite.
 */

import { createConnection, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deleteArtifact,
  getArtifact,
  putArtifact,
  verifyArtifactIntegrity,
} from '@/lib/artifact-store';
import {
  DEFAULT_TICKET_TTL_SECONDS,
  StorageError,
  type StorageDriver,
} from '@/lib/storage/driver';
import { readS3Config, type S3Config } from '@/lib/storage/env-config';
import { InMemoryStorageDriver } from '@/lib/storage/in-memory-driver';
import { S3StorageDriver } from '@/lib/storage/s3-driver';
import { newTenantId, systemTenantScope } from '@/lib/tenancy/tenant-scope';

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/** The contract-level failure classes every backend must agree on (#1830). */
export type ConformanceFailureKind =
  | 'missing'
  | 'corrupt'
  | 'permission-denied'
  | 'transient'
  | 'permanent';

/** A stored artifact is absent: never written, removed, or expired. */
export class MissingArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingArtifactError';
  }
}

/**
 * Bytes exist but cannot be interpreted: truncated, tampered with, or not a
 * valid artifact envelope.
 */
export class CorruptArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptArtifactError';
  }
}

/**
 * Maps whatever a backend threw onto the shared failure taxonomy, so the suite
 * asserts identical behaviour no matter which backend is configured.
 */
export function classifyConformanceFailure(error: unknown): ConformanceFailureKind {
  if (error instanceof MissingArtifactError) return 'missing';
  if (error instanceof CorruptArtifactError) return 'corrupt';
  if (error instanceof Error && (error as { code?: unknown }).code === 'ARTIFACT_CORRUPT') {
    return 'corrupt';
  }

  if (error instanceof StorageError) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'permission-denied';
    if (error.statusCode === 404) return 'missing';
    return error.kind === 'transient' ? 'transient' : 'permanent';
  }

  const code =
    typeof error === 'object' && error !== null
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error);
  if (
    /NOAUTH|WRONGPASS|not authorized|invalidaccesskeyid|signaturedoesnotmatch|permission denied/i.test(
      `${code} ${message}`,
    )
  ) {
    return 'permission-denied';
  }
  // driver.ts: a throw out of a storage call is a network-level failure, which
  // is retryable by definition.
  return 'transient';
}

/** Runs `operation`, reporting the taxonomy class of any failure. */
export async function failureKind(
  operation: () => Promise<unknown>,
): Promise<ConformanceFailureKind | 'success'> {
  try {
    await operation();
    return 'success';
  } catch (error) {
    return classifyConformanceFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Artifact envelope
// ---------------------------------------------------------------------------

/**
 * Artifacts travel as a self-describing document so every backend can detect a
 * torn write the same way: the parsing read refuses a payload that is not a
 * well-formed envelope. Raw reads deliberately stay uninterpreted — integrity
 * is the parsing read's job.
 */
interface ArtifactEnvelope {
  v: 1;
  payload: string;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export function encodeArtifact(bytes: Uint8Array): Uint8Array {
  const envelope: ArtifactEnvelope = {
    v: 1,
    payload: Buffer.from(bytes).toString('base64'),
  };
  return new Uint8Array(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

export function decodeArtifact(raw: Uint8Array): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch (error) {
    throw new CorruptArtifactError(
      `artifact is not a valid envelope: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const envelope = parsed as Partial<ArtifactEnvelope> | null;
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    envelope.v !== 1 ||
    typeof envelope.payload !== 'string'
  ) {
    throw new CorruptArtifactError('artifact envelope has an unexpected shape');
  }
  if (envelope.payload.length % 4 !== 0 || !BASE64_PATTERN.test(envelope.payload)) {
    throw new CorruptArtifactError('artifact payload is not canonically base64-encoded');
  }
  return new Uint8Array(Buffer.from(envelope.payload, 'base64'));
}

// ---------------------------------------------------------------------------
// Backend adapter
// ---------------------------------------------------------------------------

/**
 * The byte-level face of a storage backend.
 *
 * Every backend — in-memory store, Redis, MinIO — is normalized to this
 * interface so one suite can drive all of them. `putRaw`/`getRaw` are
 * deliberately uninterpreted: they move exactly the bytes handed to them and
 * never invent integrity checks of their own, so the suite observes precisely
 * what a backend stored.
 */
export interface ArtifactBackend {
  readonly name: string;
  /** Stores `bytes` exactly, replacing any existing value for `id`. */
  putRaw(id: string, bytes: Uint8Array): Promise<void>;
  /** Returns the exact stored bytes, or `null` when nothing is stored. */
  getRaw(id: string): Promise<Uint8Array | null>;
  /** Whether anything is stored under `id`. */
  head(id: string): Promise<boolean>;
  /** Removes `id`, succeeding when it was already absent. */
  remove(id: string): Promise<void>;
  /**
   * Writes `bytes` straight to the stored location, bypassing any atomic
   * write path — models a write killed after half the bytes landed.
   */
  tear?: (id: string, bytes: Uint8Array) => Promise<void>;
  /**
   * Attempts a deliberately mis-credentialed read. Resolves to
   * `'permission-denied'` when the backend refused the operation, or `null`
   * when the backend cannot express that boundary.
   */
  probePermissionDenied?: () => Promise<ConformanceFailureKind | null>;
}

export interface ConformanceCaps {
  /** The backend exposes a ticket surface with a TTL on the ticket. */
  ticketTtl: boolean;
}

export interface ConformanceHarness {
  readonly backend: ArtifactBackend;
  /**
   * Ticket-based access to the same backend family, when it has one. The
   * in-memory family pairs its byte store with the in-memory ticket driver;
   * the MinIO family pairs its object store with the S3 driver.
   */
  readonly tickets?: StorageDriver;
  /** Removes everything this harness wrote. */
  readonly cleanup: () => Promise<void>;
}

export interface ConformanceSuiteOptions {
  readonly caps?: Partial<ConformanceCaps>;
  readonly enabled: boolean;
  readonly reason?: string;
}

/** Stores an encoded artifact through a backend. */
async function storeArtifact(
  backend: ArtifactBackend,
  id: string,
  bytes: Uint8Array,
): Promise<void> {
  await backend.putRaw(id, encodeArtifact(bytes));
}

/** Reads and decodes an artifact, reporting absence or corruption. */
async function readArtifact(backend: ArtifactBackend, id: string): Promise<Uint8Array> {
  const raw = await backend.getRaw(id);
  if (raw === null) throw new MissingArtifactError(`no artifact stored at ${id}`);
  return decodeArtifact(raw);
}

/** Reassembles a byte stream in fixed-size chunks. */
function readInChunks(bytes: Uint8Array, chunkSize: number): Uint8Array {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(Buffer.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength))));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array, context: string): void {
  expect(actual.byteLength, `${context}: byte length differs`).toBe(expected.byteLength);
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected)), `${context}: bytes differ`).toBe(
    0,
  );
}

/** A byte stream that does not equal either of the expected revisions. */
function isEitherRevision(actual: Uint8Array, first: Uint8Array, second: Uint8Array): boolean {
  const candidate = Buffer.from(actual);
  return (
    Buffer.compare(candidate, Buffer.from(first)) === 0 ||
    Buffer.compare(Buffer.from(second), Buffer.from(actual)) === 0
  );
}

/**
 * A backend whose connection dies mid-write: every write fails with a
 * retryable error and commits nothing, while reads keep working so a scenario
 * can inspect what the backend was left holding (#1830 fault injection).
 */
class InterruptedWriteBackend implements ArtifactBackend {
  readonly name: string;

  constructor(private readonly inner: ArtifactBackend) {
    this.name = `${inner.name} (interrupted connection)`;
  }

  async putRaw(): Promise<void> {
    const error = new Error('injected: connection killed mid-write') as Error & { code?: string };
    error.code = 'ECONNRESET';
    throw error;
  }

  getRaw(id: string): Promise<Uint8Array | null> {
    return this.inner.getRaw(id);
  }

  head(id: string): Promise<boolean> {
    return this.inner.head(id);
  }

  async remove(id: string): Promise<void> {
    await this.inner.remove(id);
  }
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

/**
 * Boundary payload sizes every backend must round trip: empty, single byte,
 * seed-sized, and up to a full 64 KiB block. These are the byte-level edges
 * the Rust container-stress generators probe on the other side of the
 * contract.
 */
export const CONFORMANCE_PAYLOAD_SIZES: readonly number[] = [
  0, 1, 2, 7, 31, 32, 33, 255, 256, 1024, 4096, 65536,
];

/** Deterministic payload bytes for a given size. */
export function conformancePayload(size: number, seed = 0): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    bytes[index] = (seed + index * 31) & 0xff;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

/**
 * Expands into the full conformance suite for one backend family.
 *
 * Every scenario takes a fresh harness from `createHarness`, so backends never
 * share state between scenarios and are cleaned up deterministically.
 */
export function runStorageConformanceSuite(
  name: string,
  createHarness: () => Promise<ConformanceHarness> | ConformanceHarness,
  options: ConformanceSuiteOptions,
): void {
  const caps: ConformanceCaps = { ticketTtl: false, ...options.caps };

  if (!options.enabled) {
    describe(`Storage conformance: ${name}`, () => {
      it.skip(`skipped: ${options.reason ?? 'backend not configured'}`, () => {});
    });
    return;
  }

  describe(`Storage conformance: ${name}`, () => {
    let harness: ConformanceHarness | undefined;

    const use = async (): Promise<ConformanceHarness> => {
      harness = await createHarness();
      return harness;
    };

    afterEach(async () => {
      const current = harness;
      harness = undefined;
      if (current) await current.cleanup();
    });

    it('round trips a stored artifact byte for byte', async () => {
      const { backend } = await use();
      const payload = conformancePayload(512, 1);
      await storeArtifact(backend, 'rt-1', payload);

      expectBytesEqual(await readArtifact(backend, 'rt-1'), payload, 'round trip');
      expect(await backend.head('rt-1')).toBe(true);
    });

    it('reports missing artifacts as absent on every read path', async () => {
      const { backend } = await use();
      expect(await backend.getRaw('missing-1')).toBeNull();
      expect(await backend.head('missing-1')).toBe(false);
      expect(await failureKind(() => readArtifact(backend, 'missing-1'))).toBe('missing');
      await expect(backend.remove('missing-1')).resolves.toBeUndefined();
    });

    it('replaces an artifact wholesale on overwrite', async () => {
      const { backend } = await use();
      const first = conformancePayload(64, 2);
      const second = conformancePayload(4096, 3);
      await storeArtifact(backend, 'over-1', first);
      await storeArtifact(backend, 'over-1', second);

      expectBytesEqual(await readArtifact(backend, 'over-1'), second, 'overwrite');
      const raw = await backend.getRaw('over-1');
      expect(raw).not.toBeNull();
      expectBytesEqual(raw as Uint8Array, encodeArtifact(second), 'stored bytes after overwrite');
    });

    it('deletes idempotently', async () => {
      const { backend } = await use();
      await storeArtifact(backend, 'del-1', conformancePayload(16, 4));
      await backend.remove('del-1');
      await backend.remove('del-1');

      expect(await backend.head('del-1')).toBe(false);
      expect(await failureKind(() => readArtifact(backend, 'del-1'))).toBe('missing');
    });

    it('never mixes concurrent revisions of the same artifact', async () => {
      const { backend } = await use();
      const v1 = conformancePayload(2048, 5);
      const v2 = conformancePayload(8192, 6);
      const encodedV1 = encodeArtifact(v1);
      const encodedV2 = encodeArtifact(v2);

      const reads = Array.from({ length: 24 }, async () => {
        const raw = await backend.getRaw('hot-1');
        if (raw === null) return;
        expect(
          isEitherRevision(raw, encodedV1, encodedV2),
          `hot read returned a mixed revision (${raw.byteLength} bytes)`,
        ).toBe(true);
      });

      const writes = Array.from({ length: 12 }, (_, index) =>
        storeArtifact(backend, 'hot-1', index % 2 === 0 ? v1 : v2),
      );

      await Promise.all([...writes, ...reads]);

      const settled = await readArtifact(backend, 'hot-1');
      expect(
        isEitherRevision(settled, v1, v2),
        'hot artifact must settle on a whole revision',
      ).toBe(true);
    });

    it('streams exactly what a whole read yields', async () => {
      const { backend } = await use();
      for (const [index, size] of [0, 7, 33, 4096].entries()) {
        const id = `stream-${index}`;
        const payload = conformancePayload(size, 10 + index);
        await storeArtifact(backend, id, payload);

        const whole = await backend.getRaw(id);
        expect(whole, `${id} must be stored`).not.toBeNull();
        expectBytesEqual(
          readInChunks(whole as Uint8Array, 7),
          whole as Uint8Array,
          `streaming read for ${id}`,
        );
        expectBytesEqual(await readArtifact(backend, id), payload, `decoded payload for ${id}`);
      }
    });

    it('round trips every boundary payload size', async () => {
      const { backend } = await use();
      for (const size of CONFORMANCE_PAYLOAD_SIZES) {
        const id = `boundary-${size}`;
        const payload = conformancePayload(size, size % 251);
        await storeArtifact(backend, id, payload);
        expectBytesEqual(await readArtifact(backend, id), payload, `payload of ${size} bytes`);
      }
    });

    it('surfaces a torn write as a typed corruption failure', async () => {
      const { backend } = await use();
      expect(backend.tear, 'backend must support tearing for this scenario').toBeTypeOf('function');
      const tear = backend.tear as (id: string, bytes: Uint8Array) => Promise<void>;

      await storeArtifact(backend, 'torn-1', conformancePayload(2048, 20));
      const torn = encodeArtifact(conformancePayload(2048, 21)).subarray(0, 100);
      await tear('torn-1', torn);

      expect(await backend.head('torn-1')).toBe(true);
      expect(await failureKind(() => readArtifact(backend, 'torn-1'))).toBe('corrupt');
      // Raw reads deliberately stay uninterpreted: they surface what is
      // stored, and the parsing read is what refuses it.
      const raw = await backend.getRaw('torn-1');
      expect(raw).not.toBeNull();
      expectBytesEqual(raw as Uint8Array, torn, 'raw read of a torn artifact');
    });

    it('leaves no partial state behind an interrupted write', async () => {
      const { backend } = await use();
      const committed = conformancePayload(1024, 30);
      await storeArtifact(backend, 'fault-1', committed);

      const faulted = new InterruptedWriteBackend(backend);
      expect(
        await failureKind(() => storeArtifact(faulted, 'fault-1', conformancePayload(2048, 31))),
      ).toBe('transient');
      expect(
        await failureKind(() => storeArtifact(faulted, 'fault-fresh', conformancePayload(16, 32))),
      ).toBe('transient');

      // The committed revision is untouched, and the write that never landed
      // left nothing behind.
      expectBytesEqual(await readArtifact(backend, 'fault-1'), committed, 'committed revision');
      expect(await backend.head('fault-fresh')).toBe(false);
    });

    it('types a permission refusal as permission-denied', async () => {
      const { backend } = await use();
      if (backend.probePermissionDenied === undefined) return;
      const kind = await backend.probePermissionDenied();
      if (kind === null) return; // backend cannot express the boundary
      expect(kind).toBe('permission-denied');
    });

    if (caps.ticketTtl) {
      it('bounds the default ticket TTL', async () => {
        const { tickets } = await use();
        expect(tickets, 'ticket TTL backend must expose tickets').toBeDefined();
        const before = Date.now();
        const ticket = await (tickets as StorageDriver).createUploadTicket('ttl-default', {
          sizeBytes: 16,
        });
        const expiry = new Date(ticket.expiresAt).getTime();
        expect(expiry).toBeGreaterThan(before);
        expect(expiry).toBeLessThanOrEqual(before + (DEFAULT_TICKET_TTL_SECONDS + 10) * 1000);
      });

      it('honours a custom upload ticket TTL', async () => {
        const { tickets } = await use();
        const before = Date.now();
        const ticket = await (tickets as StorageDriver).createUploadTicket('ttl-custom', {
          sizeBytes: 16,
          ttlSeconds: 60,
        });
        const expiry = new Date(ticket.expiresAt).getTime();
        expect(expiry).toBeGreaterThan(before);
        expect(expiry).toBeLessThanOrEqual(before + 70 * 1000);
      });

      it('honours a custom download ticket TTL', async () => {
        const { tickets } = await use();
        const driver = tickets as StorageDriver;
        await driver.createUploadTicket('ttl-download', { sizeBytes: 16 });
        const before = Date.now();
        const ticket = await driver.createDownloadTicket('ttl-download', 60);
        const expiry = new Date(ticket.expiresAt).getTime();
        expect(expiry).toBeGreaterThan(before);
        expect(expiry).toBeLessThanOrEqual(before + 70 * 1000);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Redis KV backend
// ---------------------------------------------------------------------------

/** A command that failed inside Redis (an `-ERR ...` reply). */
class RedisCommandError extends Error {
  readonly code: string;

  constructor(reply: string) {
    super(reply);
    this.name = 'RedisCommandError';
    this.code = reply.split(' ')[0] ?? '';
  }
}

interface ParsedReply {
  value: unknown;
  next: number;
}

function parseReplyAt(buffer: Buffer, offset: number): ParsedReply | undefined {
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return undefined;

  const type = String.fromCharCode(buffer[offset]);
  const line = buffer.toString('utf8', offset + 1, lineEnd);

  switch (type) {
    case '+':
      return { value: line, next: lineEnd + 2 };
    case '-':
      return { value: new RedisCommandError(line), next: lineEnd + 2 };
    case ':':
      return { value: Number(line), next: lineEnd + 2 };
    case '$': {
      const length = Number(line);
      if (length === -1) return { value: null, next: lineEnd + 2 };
      const start = lineEnd + 2;
      const end = start + length;
      if (buffer.length < end + 2) return undefined;
      return { value: Buffer.from(buffer.subarray(start, end)), next: end + 2 };
    }
    case '*': {
      const count = Number(line);
      if (count === -1) return { value: null, next: lineEnd + 2 };
      const items: unknown[] = [];
      let cursor = lineEnd + 2;
      for (let index = 0; index < count; index += 1) {
        const parsed = parseReplyAt(buffer, cursor);
        if (parsed === undefined) return undefined;
        items.push(parsed.value);
        cursor = parsed.next;
      }
      return { value: items, next: cursor };
    }
    default:
      throw new Error(`unexpected RESP reply type ${JSON.stringify(type)}`);
  }
}

interface RedisOptions {
  host: string;
  port: number;
  password?: string;
  database?: number;
}

/**
 * Minimal RESP2 client over `node:net`, dependency-free: the conformance suite
 * must drive a real Redis (not a mock) without adding a driver dependency, and
 * it only needs SET/GET/DEL/EXISTS/AUTH/SELECT.
 */
export class RedisConnection {
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private readonly pending: Array<{
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;

  constructor(private readonly options: RedisOptions) {}

  static fromUrl(url: string, overrides: Partial<RedisOptions> = {}): RedisConnection {
    const parsed = new URL(url);
    if (parsed.protocol !== 'redis:') {
      throw new Error(`unsupported Redis URL protocol: ${parsed.protocol}`);
    }
    const database = parsed.pathname.replace(/^\//, '');
    return new RedisConnection({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      password: parsed.password || undefined,
      database: database ? Number(database) : undefined,
      ...overrides,
    });
  }

  async connect(): Promise<void> {
    const socket = createConnection({ host: this.options.host, port: this.options.port });
    this.socket = socket;
    socket.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        socket.off('connect', onConnect);
        reject(error);
      };
      const onConnect = (): void => {
        socket.off('error', onError);
        resolve();
      };
      socket.once('error', onError);
      socket.once('connect', onConnect);
    });

    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('redis connection closed')));

    if (this.options.password !== undefined) {
      await this.command('AUTH', this.options.password);
    }
    if (this.options.database !== undefined && this.options.database !== 0) {
      await this.command('SELECT', String(this.options.database));
    }
  }

  async command(...args: Array<string | Uint8Array>): Promise<unknown> {
    if (this.socket === undefined || this.closed) {
      throw new Error('redis connection is not open');
    }
    const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
    for (const arg of args) {
      const bytes = Buffer.from(arg);
      parts.push(
        Buffer.from(`$${bytes.byteLength}\r\n`, 'utf8'),
        bytes,
        Buffer.from('\r\n', 'utf8'),
      );
    }
    const payload = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket?.write(payload, (error) => {
        if (error) this.fail(error);
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const socket = this.socket;
    this.socket = undefined;
    if (socket === undefined) return;
    await new Promise<void>((resolve) => socket.end(() => resolve()));
    socket.destroy();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      for (;;) {
        const parsed = parseReplyAt(this.buffer, 0);
        if (parsed === undefined) break;
        this.buffer = this.buffer.subarray(parsed.next);
        const waiter = this.pending.shift();
        if (waiter === undefined) break;
        if (parsed.value instanceof RedisCommandError) {
          waiter.reject(parsed.value);
        } else {
          waiter.resolve(parsed.value);
        }
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending.splice(0)) {
      waiter.reject(error);
    }
    this.socket?.destroy();
  }
}

function toBytes(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return new Uint8Array(Buffer.from(String(value), 'utf8'));
}

/**
 * A KV backend over a live Redis connection. Artifacts are stored under a
 * per-run prefix so a shared database is never polluted across runs.
 */
export function createRedisArtifactBackend(
  connection: RedisConnection,
  url: string,
  prefix: string,
): ArtifactBackend {
  const key = (id: string): string => `${prefix}${id}`;

  return {
    name: 'redis-kv',
    async putRaw(id, bytes) {
      await connection.command('SET', key(id), bytes);
    },
    async getRaw(id) {
      return toBytes(await connection.command('GET', key(id)));
    },
    async head(id) {
      return (await connection.command('EXISTS', key(id))) === 1;
    },
    async remove(id) {
      await connection.command('DEL', key(id));
    },
    async tear(id, bytes) {
      await connection.command('SET', key(id), bytes);
    },
    async probePermissionDenied() {
      const probe = RedisConnection.fromUrl(url, { password: 'crashlab-wrong-password' });
      try {
        await probe.connect();
        await probe.command('GET', key('permission-probe'));
        await probe.close();
        return null;
      } catch (error) {
        await probe.close().catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        return /NOAUTH|WRONGPASS/.test(message) ? 'permission-denied' : null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// MinIO backend
// ---------------------------------------------------------------------------

/** A live MinIO object store driven through the real S3 ticket flow. */
export function createMinioArtifactBackend(
  driver: S3StorageDriver,
  config: S3Config,
  prefix: string,
  fetchImpl: typeof fetch = fetch,
): ArtifactBackend {
  const key = (id: string): string => `${prefix}${id}`;

  const put = async (targetKey: string, bytes: Uint8Array): Promise<void> => {
    const ticket = await driver.createUploadTicket(targetKey, { sizeBytes: bytes.byteLength });
    if (ticket.kind !== 'single') {
      throw new Error(`expected a single-PUT ticket for ${targetKey}, got ${ticket.kind}`);
    }
    const response = await fetchImpl(ticket.url, { method: 'PUT', body: Buffer.from(bytes) });
    if (!response.ok) {
      throw new StorageError(
        `MinIO PUT failed with status ${response.status}`,
        response.status >= 500 || response.status === 429 ? 'transient' : 'permanent',
        response.status,
      );
    }
  };

  return {
    name: 'minio',
    async putRaw(id, bytes) {
      await put(key(id), bytes);
    },
    async getRaw(id) {
      const ticket = await driver.createDownloadTicket(key(id));
      const response = await fetchImpl(ticket.url, { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new StorageError(
          `MinIO GET failed with status ${response.status}`,
          response.status >= 500 || response.status === 429 ? 'transient' : 'permanent',
          response.status,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async head(id) {
      return driver.exists(key(id));
    },
    async remove(id) {
      await driver.delete(key(id));
    },
    async tear(id, bytes) {
      await put(key(id), bytes);
    },
    async probePermissionDenied() {
      const denied = new S3StorageDriver({
        config: { ...config, credentials: { ...config.credentials, accessKeyId: 'crashlab-invalid-key' } },
        fetchImpl,
      });
      try {
        await denied.exists(key('permission-probe'));
        return null;
      } catch (error) {
        return classifyConformanceFailure(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Backend registrations
// ---------------------------------------------------------------------------

const redisUrl = process.env.CRASHLAB_REDIS_URL ?? process.env.REDIS_URL;
const minioConfig = readS3Config(process.env);
const runPrefix = `crashlab-conformance-${process.pid}-${Date.now().toString(36)}-`;
const redisPrefix = `${runPrefix}:`;

runStorageConformanceSuite(
  'in-memory artifact store',
  () => {
    const scope = systemTenantScope(newTenantId('org'), newTenantId('prj'));
    const stored = new Map<string, string>();
    const driver = new InMemoryStorageDriver();

    const backend: ArtifactBackend = {
      name: 'artifact-store',
      async putRaw(id, bytes) {
        const artifact = putArtifact(scope, { name: id, buffer: Buffer.from(bytes) });
        stored.set(id, artifact.id);
      },
      async getRaw(id) {
        const artifactId = stored.get(id);
        if (artifactId === undefined) return null;
        const artifact = getArtifact(scope, artifactId);
        return artifact === null ? null : new Uint8Array(artifact.buffer);
      },
      async head(id) {
        const artifactId = stored.get(id);
        return artifactId !== undefined && getArtifact(scope, artifactId) !== null;
      },
      async remove(id) {
        const artifactId = stored.get(id);
        if (artifactId === undefined) return;
        deleteArtifact(scope, artifactId);
        stored.delete(id);
      },
      async tear(id, bytes) {
        const artifactId = stored.get(id);
        const artifact = artifactId === undefined ? null : getArtifact(scope, artifactId);
        if (artifact === null) throw new Error(`cannot tear unstored artifact ${id}`);
        artifact.buffer = Buffer.from(bytes);
      },
    };

    return {
      backend,
      tickets: driver,
      cleanup: async () => {
        for (const artifactId of stored.values()) {
          deleteArtifact(scope, artifactId);
        }
        stored.clear();
      },
    };
  },
  { caps: { ticketTtl: true }, enabled: true },
);

runStorageConformanceSuite(
  'redis kv',
  async () => {
    if (redisUrl === undefined) throw new Error('redis conformance harness requires a Redis URL');
    const connection = RedisConnection.fromUrl(redisUrl);
    await connection.connect();
    const inner = createRedisArtifactBackend(connection, redisUrl, redisPrefix);
    const written = new Set<string>();

    return {
      backend: {
        ...inner,
        async putRaw(id, bytes) {
          await inner.putRaw(id, bytes);
          written.add(`${redisPrefix}${id}`);
        },
        async tear(id, bytes) {
          await inner.tear?.(id, bytes);
        },
      },
      async cleanup() {
        for (const storedKey of written) {
          await connection.command('DEL', storedKey).catch(() => undefined);
        }
        await connection.close();
      },
    };
  },
  {
    enabled: redisUrl !== undefined,
    reason: 'set CRASHLAB_REDIS_URL or REDIS_URL to run the Redis KV conformance suite',
  },
);

runStorageConformanceSuite(
  'minio object store',
  () => {
    if (!minioConfig.enabled) throw new Error('MinIO conformance harness requires CRASHLAB_S3_*');
    const driver = new S3StorageDriver({ config: minioConfig.config });
    const backend = createMinioArtifactBackend(driver, minioConfig.config, runPrefix);
    const written: string[] = [];

    return {
      backend: {
        ...backend,
        async putRaw(id, bytes) {
          await backend.putRaw(id, bytes);
          written.push(id);
        },
      },
      tickets: driver,
      async cleanup() {
        await Promise.all(
          written.map((id) => driver.delete(`${runPrefix}${id}`).catch(() => undefined)),
        );
      },
    };
  },
  {
    caps: { ticketTtl: true },
    enabled: minioConfig.enabled,
    reason: 'set CRASHLAB_S3_* to run the MinIO conformance suite (nightly workflow)',
  },
);

// ---------------------------------------------------------------------------
// In-memory integrity (#1843) — the reason the artifact store carries a checksum
// ---------------------------------------------------------------------------

describe('in-memory artifact-store integrity (#1843)', () => {
  it('flags a checksum mismatch after an in-place mutation', () => {
    const scope = systemTenantScope(newTenantId('org'), newTenantId('prj'));
    const artifact = putArtifact(scope, {
      name: 'integrity.bin',
      buffer: Buffer.from('original payload'),
    });

    expect(verifyArtifactIntegrity(artifact)).toBe(true);
    artifact.buffer = Buffer.from('tampered payload');
    expect(verifyArtifactIntegrity(artifact)).toBe(false);
  });
});
