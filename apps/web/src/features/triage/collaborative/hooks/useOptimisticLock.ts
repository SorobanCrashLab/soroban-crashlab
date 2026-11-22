'use client';

/**
 * Hook for exclusive edit mode with optimistic locking (#2192).
 *
 * Implements a 5-minute TTL lock that gives one user exclusive edit
 * rights. Only users with triage:write role can take ownership.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { safeStorage } from '@/lib/local-storage';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_STORAGE_PREFIX = 'crashlab:triage-lock:';

export interface LockState {
  hasLock: boolean;
  lockHolder: string | null;
  lockExpiresAt: number | null;
  takeOwnership: () => void;
  releaseLock: () => void;
  refreshLock: () => void;
}

export function useOptimisticLock(runId: string, canWrite: boolean = true): LockState {
  const [hasLock, setHasLock] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const key = LOCK_STORAGE_PREFIX + runId;
    try {
      const raw = safeStorage.getItem(key);
      if (raw) {
        const lock = JSON.parse(raw) as { holder: string; expiresAt: number };
        if (lock.expiresAt > Date.now()) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in this hook
          setLockHolder(lock.holder);
          setLockExpiresAt(lock.expiresAt);
        } else {
          safeStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore.
    }

    // Check for lock expiry periodically.
    refreshTimer.current = setInterval(() => {
      if (lockExpiresAt !== null && lockExpiresAt <= Date.now()) {
        setHasLock(false);
        setLockHolder(null);
        setLockExpiresAt(null);
        try {
          safeStorage.removeItem(key);
        } catch {
          // Ignore.
        }
      }
    }, 1000);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [runId, lockExpiresAt]);

  const takeOwnership = useCallback(() => {
    if (!canWrite) return;
    const key = LOCK_STORAGE_PREFIX + runId;
    const expiresAt = Date.now() + LOCK_TTL_MS;
    try {
      safeStorage.setItem(key, JSON.stringify({ holder: 'You', expiresAt }));
    } catch {
      // Ignore.
    }
    setHasLock(true);
    setLockHolder('You');
    setLockExpiresAt(expiresAt);
  }, [runId, canWrite]);

  const releaseLock = useCallback(() => {
    const key = LOCK_STORAGE_PREFIX + runId;
    try {
      safeStorage.removeItem(key);
    } catch {
      // Ignore.
    }
    setHasLock(false);
    setLockHolder(null);
    setLockExpiresAt(null);
  }, [runId]);

  const refreshLock = useCallback(() => {
    if (!hasLock) return;
    const expiresAt = Date.now() + LOCK_TTL_MS;
    setLockExpiresAt(expiresAt);
    const key = LOCK_STORAGE_PREFIX + runId;
    try {
      safeStorage.setItem(key, JSON.stringify({ holder: 'You', expiresAt }));
    } catch {
      // Ignore.
    }
  }, [hasLock, runId]);

  return { hasLock, lockHolder, lockExpiresAt, takeOwnership, releaseLock, refreshLock };
}
