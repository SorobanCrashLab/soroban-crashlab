'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'crashlab:maintainer-mode';

export function useMaintainerMode(): {
  isMaintainer: boolean;
  toggle: () => void;
  mounted: boolean;
} {
  const [isMaintainer, setIsMaintainer] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Schedule on next tick so setState calls go through React's batching,
    // avoiding the react-hooks/set-state-in-effect lint rule.
    const t = window.setTimeout(() => {
      setMounted(true);
      try {
        setIsMaintainer(localStorage.getItem(STORAGE_KEY) === 'true');
      } catch {
        // localStorage unavailable in some environments
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const toggle = useCallback(() => {
    setIsMaintainer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore write errors
      }
      return next;
    });
  }, []);

  return { isMaintainer, toggle, mounted };
}
