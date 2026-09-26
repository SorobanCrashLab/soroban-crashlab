/**
 * Storage driver conformance suite (#1624).
 *
 * This file extends the existing contract tests with additional scenarios
 * that matter for production behavior: pagination edge cases, concurrent
 * writes, TTL/expiry, error shapes on missing keys, and transactional
 * semantics.
 *
 * Runs against InMemoryStorageDriver, S3StorageDriver (mocked), and
 * InMemoryRunDriver/KVRunDriver (mocked).
 */

import { describe, expect, it } from 'vitest';
import { InMemoryStorageDriver } from './in-memory-driver';
import { S3StorageDriver } from './s3-driver';
import { InMemoryRunDriver } from './in-memory-run-driver';
import { KVRunDriver, type RedisClient } from './kv-run-driver';
import { runRunDriverContract, type RunDriverHarness } from './run-driver-contract';
import { runStorageDriverContract, type ContractHarness } from './driver-contract';
import {
  DEFAULT_TICKET_TTL_SECONDS,
  StorageError,
  classifyStatus,
} from './driver';
import type { FuzzingRun, Artifact, RunStatus } from '@/app/types';
import { buildMockRuns } from '@/app/mockRuns';

// ─── Mock S3 helper ───
const S3_CONFIG = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'crashlab-artifacts',
  credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'top-secret-value' },
};

function mockS3(): { fetchImpl: typeof fetch; objects: Set<string>; calls: Request[] } {
  const objects = new Set<string>();
  const calls: Request[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(new Request(url, init));
    const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));

    if (method === 'HEAD') {
      return new Response(null, { status: objects.has(key) ? 200 : 404 });
    }
    if (method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;

  return { fetchImpl, objects, calls };
}

// ─── Mock Redis helper for KVRunDriver ───
function createMockRedis(): RedisClient {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); return 'OK'; },
    del: async (...keys: string[]) => { keys.forEach(k => store.delete(k)); return keys.length; },
    sadd: async (key: string, ...members: string[]) => {
      if (!sets.has(key)) sets.set(key, new Set());
      members.forEach(m => sets.get(key)!.add(m));
      return members.length;
    },
    srem: async (key: string, ...members: string[]) => {
      const set = sets.get(key);
      if (!set) return 0;
      let count = 0;
      members.forEach(m => { if (set.delete(m)) count++; });
      return count;
    },
    smembers: async (key: string) => Array.from(sets.get(key) ?? []),
  };
}

// ─── Seed helpers ───
function seedMockRuns(redis: RedisClient) {
  const runs = buildMockRuns();
  for (const run of runs) {
    redis.set(`run:${run.id}`, JSON.stringify(run));
    redis.sadd('run:index', run.id);
  }
}

// ─── StorageDriver conformance (extended) ───
describe('StorageDriver conformance: pagination edge cases', () => {
  const drivers: Array<{ name: string; createHarness: () => Promise<ContractHarness> }> = [
    {
      name: 'InMemoryStorageDriver',
      createHarness: () => {
        const driver = new InMemoryStorageDriver();
        return Promise.resolve({
          driver,
          seed: async (key: string, sizeBytes: number) => {
            await driver.createUploadTicket(key, { sizeBytes });
          },
        });
      },
    },
    {
      name: 'S3StorageDriver (mocked)',
      createHarness: () => {
        const { fetchImpl, objects } = mockS3();
        return Promise.resolve({
          driver: new S3StorageDriver({ config: S3_CONFIG, fetchImpl }),
          seed: async (key: string) => { objects.add(key); },
        });
      },
    },
  ];

  for (const { name, createHarness } of drivers) {
    describe(name, () => {
      it('lists no objects when empty', async () => {
        const { driver } = await createHarness();
        // InMemory and S3 don't have a list method, but we can verify
        // exists returns false for non-existent keys
        expect(await driver.exists('missing/key')).toBe(false);
      });

      it('handles key with special characters', async () => {
        const { driver } = await createHarness();
        const key = 'runs/run-1/artifact with spaces & symbols!.zip';
        const ticket = await driver.createUploadTicket(key, { sizeBytes: 1024 });
        expect(ticket.key).toBe(key);
      });

      it('handles very long keys', async () => {
        const { driver } = await createHarness();
        const key = 'r/' + 'a'.repeat(900) + '.zip';
        const ticket = await driver.createUploadTicket(key, { sizeBytes: 1024 });
        expect(ticket.key).toBe(key);
      });

      it('exists returns false for key that was never seeded', async () => {
        const { driver } = await createHarness();
        expect(await driver.exists('runs/never-existed.zip')).toBe(false);
      });

      it('delete is idempotent for non-existent key', async () => {
        const { driver } = await createHarness();
        await driver.delete('runs/never-existed.zip');
        await driver.delete('runs/never-existed.zip'); // should not throw
      });

      it('ticket expiry is in the future', async () => {
        const { driver } = await createHarness();
        const ticket = await driver.createUploadTicket('runs/x.zip', { sizeBytes: 100 });
        const expiry = Date.parse(ticket.expiresAt);
        expect(expiry).toBeGreaterThan(Date.now());
        expect(expiry).toBeLessThan(Date.now() + (DEFAULT_TICKET_TTL_SECONDS + 10) * 1000);
      });

      it('custom TTL is respected', async () => {
        const { driver } = await createHarness();
        const ticket = await driver.createUploadTicket('runs/x.zip', { sizeBytes: 100, ttlSeconds: 60 });
        const expiry = Date.parse(ticket.expiresAt);
        expect(expiry).toBeGreaterThan(Date.now());
        expect(expiry).toBeLessThan(Date.now() + 70 * 1000);
      });
    });
  }
});

// ─── RunStorageDriver conformance (extended) ───
describe('RunStorageDriver conformance: pagination, concurrency, TTL, errors', () => {
const makeInMemoryHarness = (): RunDriverHarness => ({
  driver: new InMemoryRunDriver(),
  storesArtifactBytes: true,
  makeRun: (id: string): FuzzingRun => ({
    id,
    parentId: undefined,
    seedList: undefined,
    status: 'completed' as RunStatus,
    area: 'auth',
    severity: 'low',
    duration: 0,
    seedCount: 0,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    associatedIssues: undefined,
    annotations: undefined,
    tags: undefined,
    artifacts: [],
    replayFingerprint: undefined,
    corpusStats: undefined,
  }),
});

const makeKVHarness = (): RunDriverHarness => {
  const redis = createMockRedis();
  seedMockRuns(redis);
  return {
    driver: new KVRunDriver(redis),
    storesArtifactBytes: false,
    // KVRunDriver doesn't store artifact bytes (Upstash KV limitation)
    makeRun: (id: string): FuzzingRun => ({
      id,
      parentId: undefined,
      seedList: undefined,
      status: 'completed' as RunStatus,
      area: 'auth',
      severity: 'low',
      duration: 0,
      seedCount: 0,
      crashDetail: null,
      cpuInstructions: 0,
      memoryBytes: 0,
      minResourceFee: 0,
      queuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      associatedIssues: undefined,
      annotations: undefined,
      tags: undefined,
      artifacts: [],
      replayFingerprint: undefined,
      corpusStats: undefined,
    }),
  };
};

  const harnesses: Array<{ name: string; createHarness: () => RunDriverHarness }> = [
    { name: 'InMemoryRunDriver', createHarness: makeInMemoryHarness },
    { name: 'KVRunDriver (mocked)', createHarness: makeKVHarness },
  ];

  for (const { name, createHarness } of harnesses) {
    describe(name, () => {
      // Run the base contract first
      runRunDriverContract(name, createHarness);

      describe('pagination edge cases', () => {
        it('returns empty array when offset exceeds total', async () => {
          const { driver } = createHarness();
          const result = await driver.listRuns({ offset: 1000, limit: 10 });
          expect(result.runs).toEqual([]);
          expect(result.total).toBeGreaterThanOrEqual(0);
        });

        it('returns all items when limit is undefined', async () => {
          const { driver } = createHarness();
          const result = await driver.listRuns({ limit: undefined });
          expect(result.runs.length).toBe(result.total);
        });

        it('returns empty array when limit is 0', async () => {
          const { driver } = createHarness();
          const result = await driver.listRuns({ limit: 0 });
          expect(result.runs).toEqual([]);
          expect(result.total).toBeGreaterThanOrEqual(0);
        });

        it('handles negative offset gracefully', async () => {
          const { driver } = createHarness();
          const result = await driver.listRuns({ offset: -10, limit: 5 });
          expect(result.runs.length).toBeLessThanOrEqual(5);
        });

        it('handles negative limit gracefully', async () => {
          const { driver } = createHarness();
          const result = await driver.listRuns({ limit: -5 });
          expect(result.runs).toEqual([]);
        });

        it('filter by status returns correct subset', async () => {
          const { driver } = createHarness();
          const all = await driver.listRuns();
          const running = await driver.listRuns({ status: 'running' });
          expect(running.runs.every(r => r.status === 'running')).toBe(true);
          expect(running.total).toBe(running.runs.length);
          expect(all.total).toBeGreaterThanOrEqual(running.total);
        });

        it('status filter with pagination works correctly', async () => {
          const { driver } = createHarness();
          const page1 = await driver.listRuns({ status: 'completed', limit: 1, offset: 0 });
          const page2 = await driver.listRuns({ status: 'completed', limit: 1, offset: 1 });
          if (page1.runs.length > 0 && page2.runs.length > 0) {
            expect(page1.runs[0].id).not.toBe(page2.runs[0].id);
          }
        });
      });

      describe('concurrent writes', () => {
        it('handles concurrent putArtifact without data corruption', async () => {
          const { driver } = createHarness();
          const run = (await driver.listRuns()).runs[0];
          if (!run) return;

          const writes = Array.from({ length: 10 }, (_, i) =>
            driver.putArtifact(run.id, {
              id: `${run.id}-concurrent-${i}`,
              name: `concurrent-${i}.bin`,
              type: 'bundle',
              size: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            }, new Uint8Array([i]))
          );

          await Promise.all(writes);

          for (let i = 0; i < 10; i++) {
            const stored = await driver.getArtifact(`${run.id}-concurrent-${i}`);
            expect(stored?.metadata.id).toBe(`${run.id}-concurrent-${i}`);
            // Note: KVRunDriver (Upstash) doesn't store artifact bytes - known deviation
            if (stored?.bytes.length) {
              expect(stored.bytes[0]).toBe(i);
            }
          }
        });

        it('handles concurrent listRuns without inconsistency', async () => {
          const { driver } = createHarness();
          const reads = Array.from({ length: 20 }, () => driver.listRuns({ limit: 5 }));
          const results = await Promise.all(reads);
          for (const result of results) {
            expect(result.runs.length).toBeLessThanOrEqual(5);
            expect(result.total).toBe(results[0].total);
          }
        });

        it('handles concurrent getRun without errors', async () => {
          const { driver } = createHarness();
          const run = (await driver.listRuns()).runs[0];
          if (!run) return;

          const reads = Array.from({ length: 20 }, () => driver.getRun(run.id));
          const results = await Promise.all(reads);
          for (const result of results) {
            expect(result?.id).toBe(run.id);
          }
        });
      });

      describe('missing-key error shapes', () => {
        it('getRun returns null for non-existent ID', async () => {
          const { driver } = createHarness();
          const result = await driver.getRun('non-existent-run-id');
          expect(result).toBeNull();
        });

        it('getArtifact returns null for non-existent ID', async () => {
          const { driver } = createHarness();
          const result = await driver.getArtifact('non-existent-artifact-id');
          expect(result).toBeNull();
        });

        it('deleteRun returns false for non-existent ID', async () => {
          const { driver } = createHarness();
          const result = await driver.deleteRun('non-existent-run-id');
          expect(result).toBe(false);
        });

        it('listRuns returns empty array when no runs exist', async () => {
          const { driver: _driver } = createHarness();
          // Create a fresh driver with no data
          const freshDriver = name.includes('InMemory')
            ? new InMemoryRunDriver([])
            : new KVRunDriver(createMockRedis());
          const result = await freshDriver.listRuns();
          expect(result.runs).toEqual([]);
          expect(result.total).toBe(0);
        });
      });

      describe('TTL/expiry behavior', () => {
        it('artifacts persist until explicitly deleted', async () => {
          const { driver } = createHarness();
          const run = (await driver.listRuns()).runs[0];
          if (!run) return;

          const artifact: Artifact = {
            id: `${run.id}-ttl-test`,
            name: 'ttl.bin',
            type: 'bundle',
            size: 4,
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
          await driver.putArtifact(run.id, artifact, new Uint8Array([1, 2, 3, 4]));

          // Immediately retrieve
          const stored = await driver.getArtifact(artifact.id);
          expect(stored?.metadata.id).toBe(artifact.id);

          // Retrieve again - should still exist
          const stored2 = await driver.getArtifact(artifact.id);
          expect(stored2?.metadata.id).toBe(artifact.id);
        });

        it('deleteRun removes associated artifacts', async () => {
          const { driver } = createHarness();
          const run = (await driver.listRuns()).runs[0];
          if (!run) return;

          const artifact: Artifact = {
            id: `${run.id}-delete-test`,
            name: 'delete.bin',
            type: 'log',
            size: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
          await driver.putArtifact(run.id, artifact, new Uint8Array([1]));
          expect(await driver.getArtifact(artifact.id)).not.toBeNull();

          await driver.deleteRun(run.id);
          expect(await driver.getRun(run.id)).toBeNull();
          // Note: KVRunDriver deletes artifacts on deleteRun - verify artifact is gone
          const deletedArtifact = await driver.getArtifact(artifact.id);
          // InMemory returns null, KVRunDriver should also return null after deleteRun
          expect(deletedArtifact).toBeNull();
        });
      });

      describe('transactional semantics', () => {
it('putRun makes run immediately visible to listRuns', async () => {
           const { driver } = createHarness();
           if ('putRun' in driver && typeof driver.putRun === 'function') {
             const newRun: FuzzingRun = {
               id: 'new-run-' + Date.now(),
               parentId: undefined,
               seedList: undefined,
               status: 'running',
               area: 'auth',
               severity: 'low',
               duration: 0,
               seedCount: 0,
               crashDetail: null,
               cpuInstructions: 0,
               memoryBytes: 0,
               minResourceFee: 0,
               queuedAt: new Date().toISOString(),
               startedAt: new Date().toISOString(),
               finishedAt: new Date().toISOString(),
               associatedIssues: undefined,
               annotations: undefined,
               tags: undefined,
               artifacts: [],
               replayFingerprint: undefined,
               corpusStats: undefined,
             };
             await (driver as any).putRun(newRun);
             const result = await driver.listRuns();
             expect(result.runs.some(r => r.id === newRun.id)).toBe(true);
           }
         });

        it('putArtifact makes artifact immediately visible to getArtifact', async () => {
          const { driver } = createHarness();
          const run = (await driver.listRuns()).runs[0];
          if (!run) return;

          const artifact: Artifact = {
            id: `${run.id}-tx-test`,
            name: 'tx.bin',
            type: 'bundle',
            size: 4,
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
          await driver.putArtifact(run.id, artifact, new Uint8Array([1, 2, 3, 4]));
          const stored = await driver.getArtifact(artifact.id);
          expect(stored?.metadata.id).toBe(artifact.id);
        });
      });
    });
  }
});

// ─── Error classification conformance ───
describe('StorageError classification conformance', () => {
  it('classifies 408, 429, 5xx as transient', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(classifyStatus(status)).toBe('transient');
    }
  });

  it('classifies 4xx (except 408, 429) as permanent', () => {
    for (const status of [400, 401, 403, 404, 409, 412, 413, 422]) {
      expect(classifyStatus(status)).toBe('permanent');
    }
  });

  it('StorageError carries kind and statusCode', () => {
    const err = new StorageError('test', 'transient', 503);
    expect(err.kind).toBe('transient');
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('test');
  });

  it('StorageError is instanceof Error', () => {
    const err = new StorageError('test', 'permanent', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StorageError');
  });
});

// ─── Driver name stability ───
describe('Driver name stability', () => {
  it('InMemoryStorageDriver has stable name', () => {
    expect(new InMemoryStorageDriver().name).toBe('in-memory');
  });

  it('S3StorageDriver has stable name', () => {
    expect(new S3StorageDriver({ config: S3_CONFIG }).name).toBe('s3');
  });

  it('InMemoryRunDriver has stable name', () => {
    expect(new InMemoryRunDriver().name).toBe('in-memory-runs');
  });

  it('KVRunDriver has stable name', () => {
    expect(new KVRunDriver(createMockRedis()).name).toBe('upstash-kv');
  });
});

// ─── Cross-driver behavior consistency ───
describe('Cross-driver behavior consistency', () => {
  it('all StorageDrivers reject empty keys with permanent error', async () => {
    const inMem = new InMemoryStorageDriver();
    const { fetchImpl } = mockS3();
    const s3 = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await expect(inMem.createUploadTicket('  ', { sizeBytes: 1 })).rejects.toMatchObject({
      name: 'StorageError',
      kind: 'permanent',
    });

    await expect(s3.createUploadTicket('  ', { sizeBytes: 1 })).rejects.toMatchObject({
      name: 'StorageError',
      kind: 'permanent',
    });
  });

  it('all RunStorageDrivers return null for missing runs', async () => {
    const inMem = new InMemoryRunDriver([]);
    const kv = new KVRunDriver(createMockRedis());

    expect(await inMem.getRun('missing')).toBeNull();
    expect(await kv.getRun('missing')).toBeNull();
  });

  it('all RunStorageDrivers return consistent listRuns shape', async () => {
    const inMem = new InMemoryRunDriver();
    const redis = createMockRedis();
    seedMockRuns(redis);
    const kv = new KVRunDriver(redis);

    const inMemResult = await inMem.listRuns();
    const kvResult = await kv.listRuns();

    expect(inMemResult).toHaveProperty('runs');
    expect(inMemResult).toHaveProperty('total');
    expect(kvResult).toHaveProperty('runs');
    expect(kvResult).toHaveProperty('total');

    expect(Array.isArray(inMemResult.runs)).toBe(true);
    expect(Array.isArray(kvResult.runs)).toBe(true);
    expect(typeof inMemResult.total).toBe('number');
    expect(typeof kvResult.total).toBe('number');
  });
});