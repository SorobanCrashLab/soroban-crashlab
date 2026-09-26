/**
 * Hook for managing the guided product tour state.
 *
 * The tour auto-starts once the onboarding wizard is complete and the user has
 * not yet dismissed the tour. Dismissal persists durably (localStorage with
 * read-back verification) with the same sessionStorage/in-memory fallback
 * ladder the onboarding wizard uses, so a failed durable write never resurfaces
 * the tour in the current session.
 */

import { useEffect, useState, useCallback } from "react";
import {
  PRODUCT_TOUR_STEPS,
  getTourProgress,
  persistTourDismissal,
  readTourDismissal,
  type StorageLike,
} from "../tour-utils";
import { readCompletionFlags } from "./useOnboardingWizard";

export interface ProductTourOptions {
  /** Called when the durable (cross-session) dismissal write fails but a
   * session/memory fallback kept the tour from resurfacing. Non-blocking. */
  onPersistenceError?: (message: string) => void;
  /** Test seam: injectable persistent storage. Defaults to `window.localStorage`. */
  persistentStorage?: StorageLike | null;
  /** Test seam: injectable session storage. Defaults to `window.sessionStorage`. */
  sessionStorage?: StorageLike | null;
}

export interface ProductTourState {
  /** Whether the tour should be shown (wizard complete + not dismissed). */
  active: boolean;
  /** Whether the hook has hydrated from storage. */
  hydrated: boolean;
  /** Zero-based index of the current step. */
  currentIndex: number;
  /** Number of tour steps. */
  stepCount: number;
  /** Progress percentage for the current step (1-based). */
  progress: number;
  /** Advance to the next step (no-op on the last step). */
  next: () => void;
  /** Go back a step (no-op on the first step). */
  prev: () => void;
  /** Dismiss the tour permanently for this user. */
  dismiss: () => void;
  /** Whether the last durable write attempt failed (persistence unavailable). */
  persistenceFailed: boolean;
}

function globalStorage(name: "localStorage" | "sessionStorage"): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * Guides a post-onboarding user through the upload → run → cluster → triage →
 * schedules loop on their first dashboard visit. Mirrors `useOnboardingWizard`
 * durability semantics: reads are exception-tolerant, dismissal writes are
 * read-back verified, and failures degrade to session/in-memory markers.
 */
export function useProductTour(options: ProductTourOptions = {}): ProductTourState {
  const [hydrated, setHydrated] = useState(false);
  const [active, setActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const [inMemoryFlag] = useState<{ value: boolean }>({ value: false });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Test seams default to the real storages; reads always tolerate throws.
      const persistent =
        options.persistentStorage !== undefined
          ? options.persistentStorage
          : globalStorage("localStorage");
      const sessionStorageLike =
        options.sessionStorage !== undefined
          ? options.sessionStorage
          : globalStorage("sessionStorage");

      const wizardFlags = readCompletionFlags(persistent, sessionStorageLike, { value: false });
      const dismissalFlags = readTourDismissal(persistent, sessionStorageLike, inMemoryFlag);
      const wizardComplete =
        wizardFlags.persistent || wizardFlags.sessionFallback || wizardFlags.inMemory;
      const dismissed =
        dismissalFlags.persistent || dismissalFlags.sessionFallback || dismissalFlags.inMemory;

      setActive(wizardComplete && !dismissed);
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((index) => Math.min(index + 1, PRODUCT_TOUR_STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, []);

  const dismiss = useCallback(() => {
    const persistent =
      options.persistentStorage !== undefined
        ? options.persistentStorage
        : globalStorage("localStorage");
    const sessionStorageLike =
      options.sessionStorage !== undefined
        ? options.sessionStorage
        : globalStorage("sessionStorage");

    const result = persistTourDismissal(persistent, sessionStorageLike, inMemoryFlag);
    setActive(false);
    setPersistenceFailed(!result.persistent);

    // A dismissal that could not be made durable must never go silently
    // unnoticed: surface a non-blocking notice while the fallback keeps the
    // tour hidden for the session.
    if (!result.persistent) {
      options.onPersistenceError?.(
        "Tour progress could not be saved permanently; it will be remembered for this session only.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.onPersistenceError]);

  return {
    active,
    hydrated,
    currentIndex,
    stepCount: PRODUCT_TOUR_STEPS.length,
    progress: getTourProgress(currentIndex, PRODUCT_TOUR_STEPS.length),
    next,
    prev,
    dismiss,
    persistenceFailed,
  };
}