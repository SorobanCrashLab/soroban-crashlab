/**
 * Idempotency record store (#1634).
 *
 * Maps (scope, Idempotency-Key) to the result of the first request that used
 * the key, plus a fingerprint of that request's payload. A retried POST with
 * the same key and payload replays the stored result; the same key with a
 * different payload is a client bug and is rejected.
 *
 * Backed by Upstash KV when configured (so records survive across serverless
 * instances, like runs in `KVRunDriver`), in-memory otherwise. Records expire
 * after `IDEMPOTENCY_TTL_SECONDS`.
 */

import { createHash } from 'node:crypto';
import { getRedis, isRedisConfigured } from '@/lib/redis';

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyRecord<T = unknown> {
  scope: string;
  key: string;
  fingerprint: string;
  /** Id of the resource the first request created. */
  resourceId: string;
  /** Body returned to the first request, replayed verbatim. */
  response: T;
  createdAt: string;
  expiresAt: string;
}

export interface IdempotencyStore {
  readonly name: string;
  get<T>(scope: string, key: string): Promise<IdempotencyRecord<T> | null>;
  /**
   * Stores the record unless one already exists for (scope, key). Returns the
   * record that won: the new one, or the one a concurrent request stored first.
   */
  putIfAbsent<T>(record: IdempotencyRecord<T>): Promise<IdempotencyRecord<T>>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Key order does not change the fingerprint; any value change does. */
export function fingerprintPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload) ?? null)).digest('hex');
}

export function buildIdempotencyRecord<T>(input: {
  scope: string;
  key: string;
  payload: unknown;
  resourceId: string;
  response: T;
  now?: Date;
  ttlSeconds?: number;
}): IdempotencyRecord<T> {
  const now = input.now ?? new Date();
  const ttl = input.ttlSeconds ?? IDEMPOTENCY_TTL_SECONDS;
  return {
    scope: input.scope,
    key: input.key,
    fingerprint: fingerprintPayload(input.payload),
    resourceId: input.resourceId,
    response: input.response,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

function storageKey(scope: string, key: string): string {
  return `idempotency:${scope}:${key}`;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly name = 'in-memory';
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get<T>(scope: string, key: string): Promise<IdempotencyRecord<T> | null> {
    return this.live<T>(storageKey(scope, key));
  }

  async putIfAbsent<T>(record: IdempotencyRecord<T>): Promise<IdempotencyRecord<T>> {
    // Check and store with no await in between, so concurrent requests on
    // this instance cannot both observe the key as absent.
    const id = storageKey(record.scope, record.key);
    const existing = this.live<T>(id);
    if (existing) return existing;
    this.records.set(id, record);
    return record;
  }

  private live<T>(id: string): IdempotencyRecord<T> | null {
    const record = this.records.get(id);
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= this.now().getTime()) {
      this.records.delete(id);
      return null;
    }
    return record as IdempotencyRecord<T>;
  }
}

export class KVIdempotencyStore implements IdempotencyStore {
  readonly name = 'upstash-kv';

  constructor(private readonly ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS) {}

  async get<T>(scope: string, key: string): Promise<IdempotencyRecord<T> | null> {
    const raw = await getRedis().get(storageKey(scope, key));
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as IdempotencyRecord<T>;
  }

  async putIfAbsent<T>(record: IdempotencyRecord<T>): Promise<IdempotencyRecord<T>> {
    // SET NX makes the check-and-store atomic across instances.
    const stored = await getRedis().set(storageKey(record.scope, record.key), JSON.stringify(record), {
      nx: true,
      ex: this.ttlSeconds,
    });
    if (stored) return record;
    return (await this.get<T>(record.scope, record.key)) ?? record;
  }
}

let store: IdempotencyStore | undefined;

export function selectIdempotencyStore(): IdempotencyStore {
  if (!store) store = isRedisConfigured() ? new KVIdempotencyStore() : new InMemoryIdempotencyStore();
  return store;
}

/** Reset between tests. */
export function resetIdempotencyStore(next?: IdempotencyStore): void {
  store = next;
}
