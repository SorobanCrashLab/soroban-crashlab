/*
 * useResourceProfiler — #2297
 * Load/aggregate profile data for the resource profiler views.
 */

import type { AggregatedSpan } from '@/lib/profiling/aggregate';

export function useResourceProfiler() {
  return { spans: [] as AggregatedSpan[] };
}
