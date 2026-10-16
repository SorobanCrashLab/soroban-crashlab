/**
 * Store for CI regression results posted by workflows (#1890).
 *
 * One record per (commit SHA, suite run id) — that pair is the idempotency
 * key, so a workflow retrying its POST replays instead of duplicating, while a
 * different payload under the same key is a conflict. The newest records are
 * listed first and the store keeps a bounded history (nightly runs feed the
 * recurring/new classification history from here).
 *
 * Backed by Upstash KV when configured, in-memory otherwise — the same split
 * as `idempotency-store.ts`.
 */

import { summarizeDeltas } from '@/lib/integrations/ci-regression/classify';
import type { CiRegressionResult, ClassificationDeltas } from '@/lib/integrations/ci-regression/types';
import { getRedis, isRedisConfigured } from '@/lib/redis';
import { fingerprintPayload } from './idempotency-store';

/** Records kept; older ones fall off the index. */
export const CI_RESULTS_HISTORY_LIMIT = 1_000;

export interface CiResultRecord {
  /** `<commitSha>:<suiteRunId>`. */
  id: string;
  receivedAt: string;
  fingerprint: string;
  /** Recomputed server side from `result.fixtures`. */
  deltas: ClassificationDeltas;
  result: CiRegressionResult;
}

export type CiResultPutStatus = 'created' | 'replayed' | 'conflict';

export interface CiResultsQuery {
  commitSha?: string;
  prNumber?: number;
  limit?: number;
}

export interface CiResultsStore {
  readonly name: string;
  put(record: CiResultRecord): Promise<{ status: CiResultPutStatus; record: CiResultRecord }>;
  list(query?: CiResultsQuery): Promise<CiResultRecord[]>;
}

export function ciResultId(result: Pick<CiRegressionResult, 'commitSha' | 'suiteRunId'>): string {
  return `${result.commitSha}:${result.suiteRunId}`;
}

export function buildCiResultRecord(result: CiRegressionResult, now: Date = new Date()): CiResultRecord {
  return {
    id: ciResultId(result),
    receivedAt: now.toISOString(),
    fingerprint: fingerprintPayload(result),
    deltas: summarizeDeltas(result.fixtures),
    result,
  };
}

function resolvePut(
  existing: CiResultRecord,
  incoming: CiResultRecord,
): { status: CiResultPutStatus; record: CiResultRecord } {
  return {
    status: existing.fingerprint === incoming.fingerprint ? 'replayed' : 'conflict',
    record: existing,
  };
}

function matches(record: CiResultRecord, query: CiResultsQuery): boolean {
  if (query.commitSha && record.result.commitSha !== query.commitSha) return false;
  if (query.prNumber !== undefined && record.result.prNumber !== query.prNumber) return false;
  return true;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

export class InMemoryCiResultsStore implements CiResultsStore {
  readonly name = 'in-memory';
  /** Newest last; trimmed to the history limit. */
  private readonly records: CiResultRecord[] = [];

  async put(record: CiResultRecord) {
    // No await between the lookup and the push, so concurrent posts on this
    // instance cannot both store the same key.
    const existing = this.records.find((r) => r.id === record.id);
    if (existing) return resolvePut(existing, record);
    this.records.push(record);
    if (this.records.length > CI_RESULTS_HISTORY_LIMIT) this.records.shift();
    return { status: 'created' as const, record };
  }

  async list(query: CiResultsQuery = {}) {
    const limit = clampLimit(query.limit);
    return [...this.records].reverse().filter((r) => matches(r, query)).slice(0, limit);
  }
}

const RECORD_PREFIX = 'ci-result:';
const INDEX_KEY = 'ci-results:index';

function parseRecord(raw: unknown): CiResultRecord | null {
  if (!raw) return null;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as CiResultRecord;
}

export class KVCiResultsStore implements CiResultsStore {
  readonly name = 'upstash-kv';

  async put(record: CiResultRecord) {
    const redis = getRedis();
    // SET NX makes the idempotency check atomic across instances.
    const stored = await redis.set(`${RECORD_PREFIX}${record.id}`, JSON.stringify(record), { nx: true });
    if (!stored) {
      const existing = parseRecord(await redis.get(`${RECORD_PREFIX}${record.id}`));
      if (existing) return resolvePut(existing, record);
    }
    await redis.lpush(INDEX_KEY, record.id);
    await redis.ltrim(INDEX_KEY, 0, CI_RESULTS_HISTORY_LIMIT - 1);
    return { status: 'created' as const, record };
  }

  async list(query: CiResultsQuery = {}) {
    const limit = clampLimit(query.limit);
    const redis = getRedis();
    const ids = await redis.lrange<string>(INDEX_KEY, 0, CI_RESULTS_HISTORY_LIMIT - 1);
    if (ids.length === 0) return [];
    const raws = await redis.mget<unknown[]>(...ids.map((id) => `${RECORD_PREFIX}${id}`));
    return raws
      .map(parseRecord)
      .filter((r): r is CiResultRecord => r !== null && matches(r, query))
      .slice(0, limit);
  }
}

let store: CiResultsStore | undefined;

export function selectCiResultsStore(): CiResultsStore {
  if (!store) store = isRedisConfigured() ? new KVCiResultsStore() : new InMemoryCiResultsStore();
  return store;
}

/** Reset between tests. */
export function resetCiResultsStore(next?: CiResultsStore): void {
  store = next;
}
