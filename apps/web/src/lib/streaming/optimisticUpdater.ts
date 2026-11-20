/**
 * Optimistic UI state machine (#2191).
 *
 * Manages local state updates that are applied immediately (optimistic),
 * then confirmed or rolled back when the server event arrives.
 */

import type { FuzzingRun, RunStatus } from '@/app/types';

export type OptimisticStatus = 'pending' | 'confirmed' | 'rollback';

export interface OptimisticUpdate<T> {
  pending: T;
  confirmed: T | null;
  status: OptimisticStatus;
  timestamp: number;
}

export function createOptimisticUpdate<T>(pending: T): OptimisticUpdate<T> {
  return { pending, confirmed: null, status: 'pending', timestamp: Date.now() };
}

export function confirmUpdate<T>(update: OptimisticUpdate<T>, confirmed: T): OptimisticUpdate<T> {
  return { ...update, confirmed, status: 'confirmed' };
}

export function rollbackUpdate<T>(update: OptimisticUpdate<T>): OptimisticUpdate<T> {
  return { ...update, status: 'rollback' };
}

export function applyOptimisticUpdate<T>(
  items: T[],
  update: OptimisticUpdate<T>,
  matcher: (item: T) => boolean,
): T[] {
  if (update.status === 'rollback') return items;
  return items.map((item) =>
    matcher(item) ? { ...item, ...update.pending as object } as T : item,
  );
}

/**
 * Apply a status change optimistically to a list of runs.
 * If the server later disagrees, the rollback restores the original status.
 */
export function applyStatusChange(
  runs: FuzzingRun[],
  runId: string,
  newStatus: RunStatus,
): FuzzingRun[] {
  return runs.map((run) =>
    run.id === runId ? { ...run, status: newStatus } : run,
  );
}

export function applyMetricsUpdate(
  runs: FuzzingRun[],
  runId: string,
  metrics: { seedCount: number; duration: number },
): FuzzingRun[] {
  return runs.map((run) =>
    run.id === runId
      ? { ...run, seedCount: metrics.seedCount, duration: metrics.duration }
      : run,
  );
}

export function rollbackStatusChange(
  runs: FuzzingRun[],
  runId: string,
  originalStatus: RunStatus,
): FuzzingRun[] {
  return runs.map((run) =>
    run.id === runId ? { ...run, status: originalStatus } : run,
  );
}

/**
 * Merge a server-confirmed update into the list, replacing the optimistic one.
 */
export function mergeConfirmedUpdate(
  runs: FuzzingRun[],
  runId: string,
  confirmed: Partial<FuzzingRun>,
): FuzzingRun[] {
  return runs.map((run) =>
    run.id === runId ? { ...run, ...confirmed } : run,
  );
}
