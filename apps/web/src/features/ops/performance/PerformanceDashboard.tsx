// WIP scaffold for issue #2280 (Performance Observability & Web Vitals). Not wired to
// /api/perf-metrics/summary yet — see docs/performance/frontend-observability.md.
"use client";

import { RouteVitalsTable } from "./RouteVitalsTable";
import { RegressionAlerts } from "./RegressionAlerts";
import { usePerfMetrics } from "./hooks/usePerfMetrics";

export function PerformanceDashboard() {
  const { routes, isLoading } = usePerfMetrics();

  if (isLoading) {
    return <div role="status">Loading performance metrics…</div>;
  }

  return (
    <div role="region" aria-label="Performance dashboard">
      <RegressionAlerts routes={routes} />
      <RouteVitalsTable routes={routes} />
    </div>
  );
}
