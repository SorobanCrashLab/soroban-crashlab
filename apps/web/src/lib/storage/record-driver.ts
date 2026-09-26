/**
 * Key/value record storage for security state (#1548).
 *
 * The artifact drivers in this folder move blobs around with presigned tickets,
 * which is the wrong shape for a role assignment or an audit entry: those are
 * small, read-mostly-by-name records that must survive the process that wrote
 * them. On serverless every invocation can be a fresh instance, so a module
 * level array is not a store — it is a scratch pad that happens to be empty
 * when you look.
 *
 * Two primitives, deliberately kept small:
 *
 * - **Records** — a named string value, addressed by key, with a companion
 *   index set for enumeration. Roles live here.
 * - **Entries** — an append-only list per key with a hard entry cap. Audit logs
 *   live here. `appendEntry` only ever pushes and trims from the tail, so a
 *   caller cannot rewrite history through this interface; retention is a
 *   property of the cap plus the age filter applied on read.
 *
 * Everything here is runtime-agnostic: no `node:` builtins, Web Crypto only.
 * `rbac.ts` is reached from the proxy/middleware entry points, which run on the
 * Edge runtime, and pulling `node:crypto` into that graph is how an auth change
 * turns into an unrelated bundle failure.
 */

import { getRedis, isRedisConfigured } from '@/lib/redis';

/** Append-only list semantics with a bounded number of retained entries. */
export interface RecordDriver {
  /** Stable identifier, surfaced in diagnostics. */
  readonly name: string;

  getRecord(key: string): Promise<string | null>;
  putRecord(key: string, value: string): Promise<void>;
  deleteRecord(key: string): Promise<boolean>;

  addToIndex(indexKey: string, member: string): Promise<void>;
  removeFromIndex(indexKey: string, member: string): Promise<void>;
  /** Unordered. Callers sort. */
  listIndex(indexKey: string): Promise<string[]>;
  /** Empties the whole index. */
  clearIndex(indexKey: string): Promise<void>;

  /** Appends and trims the tail so at most `maxEntries` are retained. */
  appendEntry(key: string, entry: string, maxEntries: number): Promise<void>;
  /** Newest first, at most `limit` entries. */
  listEntries(key: string, limit: number): Promise<string[]>;
  countEntries(key: string): Promise<number>;
  /** Drops everything but the newest `keep` entries. `keep <= 0` empties it. */
  trimEntries(key: string, keep: number): Promise<void>;
}

const DEFAULT_MAX_ENTRIES = 10_000;

/** Upper bound on a single read window, so callers cannot ask for all of time. */
const MAX_READ_ENTRIES = 10_000;

/**
 * Parses a positive integer from the environment, falling back when unset,
 * blank, non-numeric or non-positive. A retention misconfiguration should
 * degrade to the documented default, not to zero retained entries.
 */
export function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class InMemoryRecordDriver implements RecordDriver {
  readonly name = 'in-memory-records';

  private readonly records = new Map<string, string>();
  private readonly indexes = new Map<string, Set<string>>();
  private readonly entries = new Map<string, string[]>();

  async getRecord(key: string): Promise<string | null> {
    return this.records.get(key) ?? null;
  }

  async putRecord(key: string, value: string): Promise<void> {
    this.records.set(key, value);
  }

  async deleteRecord(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async addToIndex(indexKey: string, member: string): Promise<void> {
    const existing = this.indexes.get(indexKey);
    if (existing) {
      existing.add(member);
    } else {
      this.indexes.set(indexKey, new Set([member]));
    }
  }

  async removeFromIndex(indexKey: string, member: string): Promise<void> {
    this.indexes.get(indexKey)?.delete(member);
  }

  async listIndex(indexKey: string): Promise<string[]> {
    return [...(this.indexes.get(indexKey) ?? [])];
  }

  async clearIndex(indexKey: string): Promise<void> {
    this.indexes.delete(indexKey);
  }

  async appendEntry(key: string, entry: string, maxEntries: number): Promise<void> {
    const list = this.entries.get(key) ?? [];
    list.push(entry);
    const cap = maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
    if (list.length > cap) {
      list.splice(0, list.length - cap);
    }
    this.entries.set(key, list);
  }

  async listEntries(key: string, limit: number): Promise<string[]> {
    const list = this.entries.get(key) ?? [];
    const bounded = limit > 0 ? limit : list.length;
    return list.slice(list.length - bounded).reverse();
  }

  async countEntries(key: string): Promise<number> {
    return this.entries.get(key)?.length ?? 0;
  }

  async trimEntries(key: string, keep: number): Promise<void> {
    if (keep <= 0) {
      this.entries.delete(key);
      return;
    }
    const list = this.entries.get(key);
    if (!list) return;
    this.entries.set(key, list.slice(list.length - keep));
  }
}

/**
 * The subset of the Upstash client this driver needs. Declared locally so the
 * in-memory and Redis drivers are provably held to the same surface.
 */
export interface RecordRedisClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<unknown>;
  rpush(key: string, member: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<unknown>;
  llen(key: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export class RedisRecordDriver implements RecordDriver {
  readonly name = 'upstash-records';

  constructor(private readonly redis: RecordRedisClient) {}

  async getRecord(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  async putRecord(key: string, value: string): Promise<void> {
    await this.redis.set(key, value);
  }

  async deleteRecord(key: string): Promise<boolean> {
    const removed = await this.redis.del(key);
    return typeof removed === 'number' ? removed > 0 : false;
  }

  async addToIndex(indexKey: string, member: string): Promise<void> {
    await this.redis.sadd(indexKey, member);
  }

  async removeFromIndex(indexKey: string, member: string): Promise<void> {
    await this.redis.srem(indexKey, member);
  }

  async listIndex(indexKey: string): Promise<string[]> {
    return asStringArray(await this.redis.smembers(indexKey));
  }

  async clearIndex(indexKey: string): Promise<void> {
    await this.redis.del(indexKey);
  }

  async appendEntry(key: string, entry: string, maxEntries: number): Promise<void> {
    const cap = maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
    await this.redis.rpush(key, entry);
    // Tail trim keeps the newest `cap` entries; -1 as the stop index is the
    // Redis idiom for "through the last element".
    await this.redis.ltrim(key, -cap, -1);
  }

  async listEntries(key: string, limit: number): Promise<string[]> {
    // Redis rejects absurd negative offsets, so the requested window is clamped
    // to something a real log can actually hold.
    const bounded = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_READ_ENTRIES) : MAX_READ_ENTRIES;
    const entries = asStringArray(await this.redis.lrange(key, -bounded, -1));
    return entries.reverse();
  }

  async countEntries(key: string): Promise<number> {
    const length = await this.redis.llen(key);
    return typeof length === 'number' ? length : 0;
  }

  async trimEntries(key: string, keep: number): Promise<void> {
    if (keep <= 0) {
      // `LTRIM key 0 -1` is a no-op in Redis — it keeps everything — so
      // emptying the log has to be an explicit delete.
      await this.redis.del(key);
      return;
    }
    await this.redis.ltrim(key, -keep, -1);
  }
}

let override: RecordDriver | null = null;
let selected: RecordDriver | null = null;

function createRedisDriver(): RecordDriver | null {
  if (!isRedisConfigured()) return null;
  // `getRedis` only constructs a client when KV is available, so importing it
  // statically does not pull a connection into deployments that have none.
  return new RedisRecordDriver(getRedis() as unknown as RecordRedisClient);
}

/**
 * Resolves the driver used for security state.
 *
 * Redis (Upstash KV) when the environment contract is satisfied — that is the
 * only configuration whose writes outlive the invocation. In-memory otherwise,
 * which is honest about its durability: it is the documented single-instance
 * default, not a silent stand-in for a durable log.
 */
export function selectRecordDriver(): RecordDriver {
  if (override) return override;
  if (selected) return selected;

  const redisDriver = createRedisDriver();
  selected = redisDriver ?? new InMemoryRecordDriver();
  return selected;
}

/** Installs a driver for the current process. Pass `null` to restore selection. */
export function setRecordDriver(driver: RecordDriver | null): void {
  override = driver;
}

/** Drops the memoised selection. Used between tests. */
export function resetRecordDriver(): void {
  override = null;
  selected = null;
}
