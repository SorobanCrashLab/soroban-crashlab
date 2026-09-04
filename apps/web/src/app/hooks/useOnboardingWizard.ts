/**
 * Hook for managing onboarding wizard state via localStorage.
 */

import { useEffect, useState, useCallback } from 'react';

// Typed storage key constants — no raw string literals are used for persistence.
export const WIZARD_COMPLETE_KEY = 'crashlab:onboarding-wizard-complete:v1';
export const WIZARD_COMPLETE_SESSION_KEY = 'crashlab:onboarding-wizard-complete-session:v1';

/** Minimal storage surface used by the durability helpers (testable without a DOM). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Result of the durable-completion write attempt. */
export interface CompletionPersistenceResult {
  /** Persisted across sessions via localStorage (durable). */
  persistent: boolean;
  /** Same-session fallback marker via sessionStorage. */
  sessionFallback: boolean;
}

/**
 * Verify a recently-written boolean flag via read-back.
 * Returns true only when the written value reads back as expected.
 */
function verifyWriteable(storage: StorageLike, key: string): boolean {
  try {
    storage.setItem(key, 'true');
    return storage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist wizard completion durably. First tries localStorage with read-back
 * verification (a throw from private mode / quota, or a failed read-back, means
 * the durable write failed). On failure it falls back to a sessionStorage
 * marker so the wizard does not resurface within the same session, and finally
 * to an in-memory marker as a last resort.
 *
 * `inMemoryFlag` is an object so its mutation is observable by the caller and
 * by the read path.
 */
export function persistCompletionDurably(
  persistentStorage: StorageLike | null,
  sessionStorageLike: StorageLike | null,
  inMemoryFlag: { value: boolean },
): CompletionPersistenceResult {
  const persistent = persistentStorage !== null && verifyWriteable(persistentStorage, WIZARD_COMPLETE_KEY);

  let sessionFallback = false;
  if (!persistent && sessionStorageLike !== null) {
    sessionFallback = verifyWriteable(sessionStorageLike, WIZARD_COMPLETE_SESSION_KEY);
  }

  // Never resurface in this session, regardless of which (if any) layer worked.
  inMemoryFlag.value = true;

  return { persistent, sessionFallback };
}

/** Read the persisted/session/in-memory completion flags. */
export function readCompletionFlags(
  persistentStorage: StorageLike | null,
  sessionStorageLike: StorageLike | null,
  inMemoryFlag: { value: boolean },
): { persistent: boolean; sessionFallback: boolean; inMemory: boolean } {
  let persistent = false;
  let sessionFallback = false;
  try {
    persistent = persistentStorage?.getItem(WIZARD_COMPLETE_KEY) === 'true' || false;
  } catch {
    persistent = false;
  }
  try {
    sessionFallback = sessionStorageLike?.getItem(WIZARD_COMPLETE_SESSION_KEY) === 'true' || false;
  } catch {
    sessionFallback = false;
  }
  return { persistent, sessionFallback, inMemory: inMemoryFlag.value };
}

export interface OnboardingWizardOptions {
  /**
   * Called when the durable (cross-session) write fails but a session/memory
   * fallback kept the wizard from resurfacing. Non-blocking — the wizard still
   * dismisses. Consumers wire this to the toast system.
   */
  onPersistenceError?: (message: string) => void;
  /** Test seam: injectable persistent storage. Defaults to `window.localStorage`. */
  persistentStorage?: StorageLike | null;
  /** Test seam: injectable session storage. Defaults to `window.sessionStorage`. */
  sessionStorage?: StorageLike | null;
}

export interface OnboardingWizardState {
  /** Whether the wizard should be shown (first-time user) */
  showWizard: boolean;
  /** Mark the wizard as complete and hide it permanently */
  markComplete: () => void;
  /** Whether the user is a first-time user (wizard not completed) */
  isFirstTime: boolean;
  /** Whether the hook has hydrated from localStorage */
  hydrated: boolean;
  /** Whether the last durable write attempt failed (persistence unavailable). */
  persistenceFailed: boolean;
}

function globalStorage(name: 'localStorage' | 'sessionStorage'): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * Custom hook for managing onboarding wizard visibility and completion state.
 *
 * The wizard is shown once for first-time users and can be dismissed
 * permanently. State persists in localStorage across sessions. Completion
 * writes are verified via read-back; when the durable write fails (Safari
 * private mode, storage quota) a sessionStorage/in-memory fallback prevents the
 * wizard from resurfacing within the same session and a non-blocking
 * `onPersistenceError` callback fires.
 */
export function useOnboardingWizard(options: OnboardingWizardOptions = {}): OnboardingWizardState {
  const [hydrated, setHydrated] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const [inMemoryFlag] = useState<{ value: boolean }>({ value: false });

  // Hydrate from storage on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const persistentStorage = options.persistentStorage !== undefined
        ? options.persistentStorage
        : globalStorage('localStorage');
      const sessionStorageLike = options.sessionStorage !== undefined
        ? options.sessionStorage
        : globalStorage('sessionStorage');
      const flags = readCompletionFlags(persistentStorage, sessionStorageLike, inMemoryFlag);
      setIsComplete(flags.persistent || flags.sessionFallback || flags.inMemory);
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist completion state durably.
  const markComplete = useCallback(() => {
    const persistentStorage = options.persistentStorage !== undefined
      ? options.persistentStorage
      : globalStorage('localStorage');
    const sessionStorageLike = options.sessionStorage !== undefined
      ? options.sessionStorage
      : globalStorage('sessionStorage');

    const result = persistCompletionDurably(persistentStorage, sessionStorageLike, inMemoryFlag);

    setIsComplete(true);
    setPersistenceFailed(!result.persistent);

    // A write that could not be made durable must never go silently unnoticed:
    // surface a non-blocking notice while the fallback keeps the tour dismissed.
    if (!result.persistent) {
      options.onPersistenceError?.(
        'Onboarding progress could not be saved permanently; it will be remembered for this session only.',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.onPersistenceError]);

  return {
    showWizard: hydrated && !isComplete,
    markComplete,
    isFirstTime: !isComplete,
    hydrated,
    persistenceFailed,
  };
}
