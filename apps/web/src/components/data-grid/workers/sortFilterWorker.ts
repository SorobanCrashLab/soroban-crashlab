/**
 * Web Worker for sort/filter/aggregation (#2190).
 *
 * Offloads heavy array operations (multi-column sort, filter, group-by)
 * to a Web Worker to keep the main thread responsive. Also usable
 * directly in the main thread as a fallback when Workers are unavailable.
 *
 * Uses existing sort/filter utilities from the codebase.
 */

import type { FuzzingRun } from '@/app/types';
import { sortRuns, compareRuns as _compareRuns, isRunSortField } from '@/app/runs-sort-utils';
import { applyRunFilters, type RunFilters } from '@/app/run-filter-utils';

export type SortFilterWorkerAPI = {
  sort(data: FuzzingRun[], field: string, direction: 'asc' | 'desc'): FuzzingRun[];
  filter(data: FuzzingRun[], filters: RunFilters): FuzzingRun[];
  aggregate(data: FuzzingRun[], field: string): { count: number; sum: number; avg: number; min: number; max: number };
}

const api: SortFilterWorkerAPI = {
  sort(data, field, direction) {
    if (!isRunSortField(field)) return data;
    return sortRuns(data, field, direction);
  },

  filter(data, filters) {
    return applyRunFilters(data, filters);
  },

  aggregate(data, field) {
    if (data.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }
    const values = data.map((r) => {
      const v = (r as unknown as Record<string, unknown>)[field];
      return typeof v === 'number' ? v : 0;
    });
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  },
};

// Export for main-thread fallback usage.
export { api };

// Worker message handler — listens for postMessage and dispatches to API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  (self as unknown as Worker).addEventListener('message', async (event: MessageEvent) => {
    const data = event.data;
    if (!data || !data.__method || data.__correlationId === undefined) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const method = (api as unknown as Record<string, (...args: any[]) => any>)[data.__method];
    if (!method) {
      (self as unknown as Worker).postMessage({
        __correlationId: data.__correlationId,
        __error: `Method ${data.__method} not found`,
      });
      return;
    }

    try {
      const result = await method(...data.__args);
      (self as unknown as Worker).postMessage({
        __correlationId: data.__correlationId,
        __result: result,
      });
    } catch (err) {
      (self as unknown as Worker).postMessage({
        __correlationId: data.__correlationId,
        __error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
