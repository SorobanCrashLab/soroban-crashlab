/**
 * Storage gateway for run annotation threads (#1429).
 *
 * Threads persist per run under a single versioned key, mirroring the
 * `crashlab:<domain>:v1` convention used across the settings surfaces. Reads
 * are SSR-safe (no `window` on the server, so the page renders an empty thread
 * list and hydrates from storage after mount) and writes throw, which is what
 * lets the composer roll a failed optimistic post back.
 */

import type { AnnotationThread } from './annotation-thread-utils';
import { safeStorage } from "../../../../lib/local-storage";

export const ANNOTATION_THREADS_STORAGE_KEY = 'crashlab:run-annotation-threads:v1';

type ThreadsByRun = Record<string, AnnotationThread[]>;

export interface AnnotationThreadGateway {
  load(runId: string): AnnotationThread[];
  /** Persists the run's threads. Throws when storage rejects the write. */
  save(runId: string, threads: readonly AnnotationThread[]): void;
}

export function parseThreadStore(raw: string | null): ThreadsByRun {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ThreadsByRun;
  } catch {
    // Corrupt storage reads as "no threads yet" rather than breaking the page.
    return {};
  }
}

export function createLocalAnnotationThreadGateway(): AnnotationThreadGateway {
  return {
    load(runId) {
      if (typeof window === 'undefined') return [];
      return parseThreadStore(safeStorage.getItem(ANNOTATION_THREADS_STORAGE_KEY))[runId] ?? [];
    },
    save(runId, threads) {
      if (typeof window === 'undefined') {
        throw new Error('Annotation threads can only be saved in the browser');
      }
      const store = parseThreadStore(safeStorage.getItem(ANNOTATION_THREADS_STORAGE_KEY));
      store[runId] = [...threads];
      safeStorage.setItem(ANNOTATION_THREADS_STORAGE_KEY, JSON.stringify(store));
    },
  };
}
