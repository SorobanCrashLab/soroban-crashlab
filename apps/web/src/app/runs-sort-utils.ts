/**
 * Stable sort helpers for the runs table (#1875 / W5-H05).
 *
 * Every comparator ends with an `id` tiebreak so rows never swap places when
 * the primary key collides (equal timestamps, durations, statuses…). The same
 * field whitelist is shared by the client comparators and by the
 * `GET /api/runs?sort=&order=` keyset pagination path, so a page boundary can
 * never duplicate or skip a row.
 */

import type { FuzzingRun } from './types';

/** Columns the runs table (and the API) accept as sort keys. */
export const RUN_SORT_FIELDS = [
  'queuedAt',
  'startedAt',
  'duration',
  'seedCount',
  'status',
  'area',
  'severity',
  'id',
] as const;

export type RunSortField = (typeof RUN_SORT_FIELDS)[number];
export type RunSortDirection = 'asc' | 'desc';

export function isRunSortField(value: string | null | undefined): value is RunSortField {
  return typeof value === 'string' && (RUN_SORT_FIELDS as readonly string[]).includes(value);
}

/**
 * Project a run onto the string/number value used for the given sort key.
 * Missing timestamps collapse to `''` so they sort deterministically.
 */
export function getRunSortValue(run: FuzzingRun, field: RunSortField): string | number {
  switch (field) {
    case 'id':
      return run.id;
    case 'duration':
      return run.duration;
    case 'seedCount':
      return run.seedCount;
    case 'status':
      return run.status;
    case 'area':
      return run.area;
    case 'severity':
      return run.severity;
    case 'startedAt':
      return run.startedAt ?? '';
    case 'queuedAt':
    default:
      // Mirrors `getRunKeyset()` in pagination-utils.ts exactly, so the default
      // sort order (and legacy cursors) stay byte-for-byte compatible.
      return run.queuedAt || run.startedAt || (run as { createdAt?: string }).createdAt || '';
  }
}

/**
 * Compare two runs for the given sort field and direction.
 *
 * Returns a negative number when `a` should be rendered before `b`. The final
 * `id` comparison is deliberately applied in the same direction as the primary
 * key: this mirrors `compareKeyset()` in `pagination-utils.ts`, which the server
 * uses to cut keyset pages, so client and server agree on the total order.
 */
export function compareRuns(
  a: FuzzingRun,
  b: FuzzingRun,
  field: RunSortField,
  direction: RunSortDirection = 'desc',
): number {
  const left = getRunSortValue(a, field);
  const right = getRunSortValue(b, field);

  let diff: number;
  if (typeof left === 'number' && typeof right === 'number') {
    diff = left - right;
  } else {
    diff = String(left).localeCompare(String(right));
  }

  // Stable id tiebreak: deterministic order when the primary key collides.
  if (diff === 0) {
    diff = a.id.localeCompare(b.id);
  }

  return direction === 'asc' ? diff : -diff;
}

/** Immutably sort a run list with the stable comparator. */
export function sortRuns(
  runs: FuzzingRun[],
  field: RunSortField,
  direction: RunSortDirection = 'desc',
): FuzzingRun[] {
  return runs.slice().sort((a, b) => compareRuns(a, b, field, direction));
}

/**
 * Keyset cursor payload for a run under an arbitrary sort key.
 *
 * `paginateKeyset()` sorts and seeks with `compareKeyset({sortKey, id})`, so the
 * sortKey must be the value of the active column, not always `queuedAt`.
 */
export function getRunSortKeyset(
  run: FuzzingRun,
  field: RunSortField,
): { sortKey: string | number; id: string } {
  return { sortKey: getRunSortValue(run, field), id: run.id };
}

/** Human-readable label for a sort field, used in live announcements. */
export const RUN_SORT_LABELS: Record<RunSortField, string> = {
  queuedAt: 'queued time',
  startedAt: 'start time',
  duration: 'duration',
  seedCount: 'seed count',
  status: 'status',
  area: 'area',
  severity: 'severity',
  id: 'run ID',
};
