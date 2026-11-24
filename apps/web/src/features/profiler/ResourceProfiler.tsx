/*
 * ResourceProfiler — #2297 (issue/076-frontend-resource-budget-profiler)
 * Phase 1 scaffold: flamechart/timeline base views with metric overlays.
 */

import type { AggregatedSpan } from '@/lib/profiling/aggregate';

export default function ResourceProfiler({ spans }: { spans: AggregatedSpan[] }) {
  return (
    <main>
      <h1>Resource profiler</h1>
      <p>{spans.length} span(s)</p>
    </main>
  );
}
