'use client';

import { useCallback, useEffect, useState } from 'react';
import { recordAuditEvent } from '../lib/audit/audit-sink';
import { safeStorage } from "@/lib/local-storage";

const STORAGE_KEY = 'crashlab:maintainer-mode';

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

export function useMaintainerMode(): {
  isMaintainer: boolean;
  toggle: () => void;
  mounted: boolean;
  storageError: boolean;
} {
  const [isMaintainer, setIsMaintainer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const syncState = () => {
      try {
        const stored = safeStorage.getItem(STORAGE_KEY);
        setIsMaintainer(stored === 'true');
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setStorageError(true);
        }
      }
    };

    // queueMicrotask keeps setState out of the effect body for the lint rule
    // while still running before the next paint (more reliable than setTimeout in e2e).
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
      syncState();
    });

    window.addEventListener('maintainer-mode-change', syncState);
    window.addEventListener('storage', syncState);

    return () => {
      cancelled = true;
      window.removeEventListener('maintainer-mode-change', syncState);
      window.removeEventListener('storage', syncState);
    };
  }, []);

  const toggle = useCallback(() => {
    setIsMaintainer((prev) => {
      const next = !prev;
      try {
        safeStorage.setItem(STORAGE_KEY, String(next));
        setStorageError(false);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setStorageError(true);
          console.warn('localStorage quota exceeded, maintainer mode will not persist');
        }
      }
      recordAuditEvent({ action: 'rbac.change', target: 'maintainer-mode', metadata: { enabled: next } });
      window.dispatchEvent(new Event('maintainer-mode-change'));
      return next;
    });
  }, []);

  return { isMaintainer, toggle, mounted, storageError };
}
