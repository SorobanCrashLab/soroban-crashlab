'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildDraftStorageKey,
  serializeDraft,
  deserializeDraft,
} from './persistent-form-state-utils';

interface PersistentFormOptions {
  /**
   * How long a draft stays valid, in milliseconds. `0` (default) means it never
   * expires until explicitly cleared.
   */
  ttlMs?: number;
}

type SetState<T> = (next: T | ((prev: T) => T)) => void;

/**
 * Like `useState`, but the value is persisted to `localStorage` so it survives
 * the component unmounting/remounting and browser tab throttling.
 *
 * Fixes #840: when the user switches tabs, the browser can throttle or tear
 * down the inactive tab and in-memory React state is lost. This hook:
 *   1. rehydrates the form from storage on mount,
 *   2. writes the latest value to storage whenever it changes, and
 *   3. flushes synchronously on `visibilitychange` (tab hidden) and `pagehide`
 *      so the final keystrokes are captured before the tab is backgrounded.
 *
 * @param formId  Stable id used to namespace the stored draft.
 * @param defaults Initial/fallback shape; also defines which keys are persisted.
 */
export function usePersistentFormState<T extends Record<string, unknown>>(
  formId: string,
  defaults: T,
  options: PersistentFormOptions = {},
): [T, SetState<T>, () => void] {
  const ttlMs = options.ttlMs ?? 0;
  const storageKey = buildDraftStorageKey(formId);

  // Lazy initialiser: rehydrate from storage exactly once on mount.
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return { ...defaults };
    try {
      return deserializeDraft(window.localStorage.getItem(storageKey), defaults, ttlMs, Date.now());
    } catch {
      return { ...defaults };
    }
  });

  // Keep the latest state in a ref so event handlers can flush without being
  // re-bound on every keystroke.
  const stateRef = useRef(state);

  const flush = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, serializeDraft(stateRef.current, Date.now()));
    } catch {
      // Storage may be full or blocked (private mode); persistence is best-effort.
    }
  }, [storageKey]);

  // Sync the ref and persist on every change (ref is updated in an effect, not
  // during render, so it stays lint-clean and predictable).
  useEffect(() => {
    stateRef.current = state;
    flush();
  }, [state, flush]);

  // Flush right before the tab is hidden/unloaded so nothing is lost on switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
    setState({ ...defaults });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [state, setState, clear];
}

export default usePersistentFormState;
