import { selectRunStorageDriver } from '@/lib/storage';
import type { RunStorageDriver } from '@/lib/storage/run-driver';
import type { FuzzingRun, RunStatus, RunArea, RunSeverity } from '@/types';

const LOCK_TTL_SECONDS = 60;
const LOCK_KEY_PREFIX = 'cron:tick:lock:';

export interface CronLock {
  acquire(lockId: string): Promise<boolean>;
  release(lockId: string): Promise<void>;
  isLocked(lockId: string): Promise<boolean>;
}

interface RunDriverWithPutRun extends RunStorageDriver {
  putRun(run: FuzzingRun): Promise<void>;
}

function createLockKey(lockId: string): string {
  return `${LOCK_KEY_PREFIX}${lockId}`;
}

function hasPutRun(driver: RunStorageDriver): driver is RunDriverWithPutRun {
  return 'putRun' in driver && typeof driver.putRun === 'function';
}

function createLockRun(key: string, lockId: string): FuzzingRun {
  return {
    id: key,
    status: 'running' as RunStatus,
    area: 'auth' as RunArea,
    severity: 'low' as RunSeverity,
    duration: 0,
    seedCount: 0,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    startedAt: new Date().toISOString(),
    queuedAt: new Date().toISOString(),
  };
}

export function createCronLock(driver: RunStorageDriver): CronLock {
  return {
    async acquire(lockId: string): Promise<boolean> {
      const key = createLockKey(lockId);
      try {
        const existing = await driver.getRun(key);
        if (existing) {
          return false;
        }

        const lockRun = createLockRun(key, lockId);

        if (hasPutRun(driver)) {
          await driver.putRun(lockRun);
        }
        return true;
      } catch {
        return false;
      }
    },

    async release(lockId: string): Promise<void> {
      const key = createLockKey(lockId);
      await driver.deleteRun(key);
    },

    async isLocked(lockId: string): Promise<boolean> {
      const key = createLockKey(lockId);
      const existing = await driver.getRun(key);
      return existing !== null;
    },
  };
}

export function createInMemoryCronLock(): CronLock {
  const locks = new Map<string, { acquiredAt: number; ttl: number }>();

  return {
    async acquire(lockId: string): Promise<boolean> {
      const now = Date.now();
      const existing = locks.get(lockId);

      if (existing && now - existing.acquiredAt < existing.ttl * 1000) {
        return false;
      }

      locks.set(lockId, { acquiredAt: now, ttl: LOCK_TTL_SECONDS });
      return true;
    },

    async release(lockId: string): Promise<void> {
      locks.delete(lockId);
    },

    async isLocked(lockId: string): Promise<boolean> {
      const now = Date.now();
      const existing = locks.get(lockId);
      if (!existing) return false;
      if (now - existing.acquiredAt > existing.ttl * 1000) {
        locks.delete(lockId);
        return false;
      }
      return true;
    },
  };
}

let globalLock: CronLock | null = null;

export function getCronLock(): CronLock {
  if (globalLock) return globalLock;

  const driver = selectRunStorageDriver();
  if ('name' in driver && driver.name === 'upstash-kv') {
    // For Upstash, use a simpler approach
    globalLock = createInMemoryCronLock();
  } else {
    globalLock = createCronLock(driver);
  }

  return globalLock;
}

export function setCronLock(lock: CronLock): void {
  globalLock = lock;
}