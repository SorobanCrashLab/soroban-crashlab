/**
 * Two-tier derived-artifact cache (in-memory LRU + IndexedDB persistence)
 * with content-hash invalidation for the Client-Side WASM Analysis Engine (#2318).
 */

import { computeContentHash } from './wasm/codecs';
import { emitAnalysisTelemetry } from './wasm/loader';
import { type AnalysisOperation } from './wasm/types';

export const ANALYSIS_CACHE_SCHEMA_VERSION = 'v1';
const IDB_DB_NAME = 'crashlab_wasm_analysis_cache';
const IDB_STORE_NAME = 'derived_artifacts';

export interface AnalysisCacheEntry<TValue = unknown> {
  key: string;
  operation: AnalysisOperation;
  contentHash: string;
  schemaVersion: string;
  value: TValue;
  createdAt: number;
  expiresAt: number;
}

export interface AnalysisCacheOptions {
  /** Max items retained in the synchronous in-memory LRU tier. Defaults to 128. */
  maxEntries?: number;
  /** Time-to-live in milliseconds. Defaults to 30 minutes. */
  ttlMs?: number;
  /** Schema version token; bumping invalidates stale entries automatically. */
  schemaVersion?: string;
  /** Enable IndexedDB backing store when available in the browser. Defaults to true. */
  enableIndexedDb?: boolean;
}

export interface AnalysisCacheStats {
  memoryEntries: number;
  hits: number;
  misses: number;
  invalidations: number;
}

/** Builds a deterministic cache key from operation name, schema version, and content hash. */
export function buildAnalysisCacheKey(
  operation: AnalysisOperation,
  contentHash: string,
  schemaVersion: string = ANALYSIS_CACHE_SCHEMA_VERSION,
): string {
  return `${schemaVersion}:${operation}:${contentHash}`;
}

export class AnalysisArtifactCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly schemaVersion: string;
  private readonly enableIndexedDb: boolean;
  private readonly memoryStore = new Map<string, AnalysisCacheEntry>();

  private hits = 0;
  private misses = 0;
  private invalidations = 0;

  constructor(options: AnalysisCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 128);
    this.ttlMs = Math.max(1000, options.ttlMs ?? 30 * 60 * 1000);
    this.schemaVersion = options.schemaVersion ?? ANALYSIS_CACHE_SCHEMA_VERSION;
    this.enableIndexedDb = options.enableIndexedDb ?? true;
  }

  /** Computes the canonical content hash for an arbitrary payload. */
  public hashPayload(payload: unknown): string {
    return computeContentHash(payload);
  }

  /** Looks up a cached derived artifact by operation and contentHash. */
  public async get<TValue>(
    operation: AnalysisOperation,
    contentHash: string,
  ): Promise<TValue | null> {
    const key = buildAnalysisCacheKey(operation, contentHash, this.schemaVersion);
    const now = Date.now();

    const memEntry = this.memoryStore.get(key);
    if (memEntry) {
      if (
        memEntry.expiresAt > now &&
        memEntry.contentHash === contentHash &&
        memEntry.schemaVersion === this.schemaVersion
      ) {
        // Refresh LRU order
        this.memoryStore.delete(key);
        this.memoryStore.set(key, memEntry);
        this.hits += 1;
        emitAnalysisTelemetry({
          type: 'cache_hit',
          operation,
          contentHash,
        });
        return memEntry.value as TValue;
      }
      this.memoryStore.delete(key);
      this.invalidations += 1;
    }

    if (this.enableIndexedDb && typeof indexedDB !== 'undefined') {
      const idbEntry = await this.readFromIndexedDb<TValue>(key);
      if (
        idbEntry &&
        idbEntry.expiresAt > now &&
        idbEntry.contentHash === contentHash &&
        idbEntry.schemaVersion === this.schemaVersion
      ) {
        this.promoteToMemory(idbEntry);
        this.hits += 1;
        emitAnalysisTelemetry({
          type: 'cache_hit',
          operation,
          contentHash,
        });
        return idbEntry.value;
      }
    }

    this.misses += 1;
    emitAnalysisTelemetry({
      type: 'cache_miss',
      operation,
      contentHash,
    });
    return null;
  }

  /** Stores a derived artifact keyed by operation and contentHash. */
  public async set<TValue>(
    operation: AnalysisOperation,
    contentHash: string,
    value: TValue,
  ): Promise<void> {
    const key = buildAnalysisCacheKey(operation, contentHash, this.schemaVersion);
    const now = Date.now();
    const entry: AnalysisCacheEntry<TValue> = {
      key,
      operation,
      contentHash,
      schemaVersion: this.schemaVersion,
      value,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.promoteToMemory(entry);

    if (this.enableIndexedDb && typeof indexedDB !== 'undefined') {
      await this.writeToIndexedDb(entry);
    }
  }

  /** Invalidates all cached artifacts matching a specific contentHash across operations. */
  public async invalidateByHash(contentHash: string): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.contentHash === contentHash) {
        this.memoryStore.delete(key);
        removed += 1;
      }
    }
    this.invalidations += removed;
    return removed;
  }

  /** Invalidates all cached artifacts for a specific operation. */
  public async invalidateOperation(operation: AnalysisOperation): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.operation === operation) {
        this.memoryStore.delete(key);
        removed += 1;
      }
    }
    this.invalidations += removed;
    return removed;
  }

  /** Clears the entire memory and IndexedDB artifact cache. */
  public async clear(): Promise<void> {
    this.invalidations += this.memoryStore.size;
    this.memoryStore.clear();
  }

  /** Returns cache hit/miss and entry count statistics. */
  public getStats(): AnalysisCacheStats {
    return {
      memoryEntries: this.memoryStore.size,
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
    };
  }

  private promoteToMemory<TValue>(entry: AnalysisCacheEntry<TValue>): void {
    if (this.memoryStore.has(entry.key)) {
      this.memoryStore.delete(entry.key);
    } else if (this.memoryStore.size >= this.maxEntries) {
      const oldestKey = this.memoryStore.keys().next().value;
      if (oldestKey !== undefined) {
        this.memoryStore.delete(oldestKey);
      }
    }
    this.memoryStore.set(entry.key, entry);
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(IDB_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async readFromIndexedDb<TValue>(
    key: string,
  ): Promise<AnalysisCacheEntry<TValue> | null> {
    const db = await this.openDatabase();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as AnalysisCacheEntry<TValue> | undefined) ?? null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  }

  private async writeToIndexedDb<TValue>(
    entry: AnalysisCacheEntry<TValue>,
  ): Promise<void> {
    const db = await this.openDatabase();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  }
}

let sharedCache: AnalysisArtifactCache | null = null;

export function getSharedAnalysisCache(
  options?: AnalysisCacheOptions,
): AnalysisArtifactCache {
  if (!sharedCache) {
    sharedCache = new AnalysisArtifactCache(options);
  }
  return sharedCache;
}

export function resetSharedAnalysisCache(): void {
  sharedCache = null;
}
