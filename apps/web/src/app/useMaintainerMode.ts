'use client';

import { useCallback, useEffect, useState } from 'react';

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
        const stored = localStorage.getItem(STORAGE_KEY);
        setIsMaintainer(stored === 'true');
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setStorageError(true);
        }
      }
    };

    // Schedule on next tick so setState calls go through React's batching,
    // avoiding the react-hooks/set-state-in-effect lint rule.
    const t = window.setTimeout(() => {
      setMounted(true);
      syncState();
    }, 0);

    window.addEventListener('maintainer-mode-change', syncState);
    window.addEventListener('storage', syncState);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('maintainer-mode-change', syncState);
      window.removeEventListener('storage', syncState);
    };
  }, []);

  const toggle = useCallback(() => {
    setIsMaintainer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
        setStorageError(false);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          setStorageError(true);
          console.warn('localStorage quota exceeded, maintainer mode will not persist');
        }
      }
      window.dispatchEvent(new Event('maintainer-mode-change'));
      return next;
    });
  }, []);

  return { isMaintainer, toggle, mounted, storageError };
}
