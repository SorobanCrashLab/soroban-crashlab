import { runRunDriverContract } from './run-driver-contract';
import { InMemoryRunDriver } from './in-memory-run-driver';
import { KVRunDriver, type RedisClient } from './kv-run-driver';

runRunDriverContract('InMemoryRunDriver', () => ({ driver: new InMemoryRunDriver(), storesArtifactBytes: true }));

/**
 * Mock Redis for KVRunDriver contract testing.
 * Provides in-memory implementations of the Upstash Redis commands used by KVRunDriver.
 */
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

runRunDriverContract('KVRunDriver (mocked Redis)', () => {
  const redis = createMockRedis();
  // Seed some initial data
  const run1 = {
    id: 'run-1',
    name: 'Test Run 1',
    status: 'completed' as const,
    startedAt: '2026-01-01T10:00:00.000Z',
    queuedAt: '2026-01-01T09:55:00.000Z',
    completedAt: '2026-01-01T10:30:00.000Z',
    config: {},
    artifacts: [],
  };
  const run2 = {
    id: 'run-2',
    name: 'Test Run 2',
    status: 'running' as const,
    startedAt: '2026-01-02T10:00:00.000Z',
    queuedAt: '2026-01-02T09:55:00.000Z',
    config: {},
    artifacts: [],
  };
  redis.set(`run:${run1.id}`, JSON.stringify(run1));
  redis.set(`run:${run2.id}`, JSON.stringify(run2));
  redis.sadd('run:index', run1.id, run2.id);

  return { driver: new KVRunDriver(redis), storesArtifactBytes: false };
});