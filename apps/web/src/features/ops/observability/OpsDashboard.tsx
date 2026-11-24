// WIP scaffold for issue #2271 (Observability & Operations Dashboard). Not wired to
// /api/health or /api/ops/* yet — see docs/ops/observability-dashboard.md.
"use client";

import { ServiceHealthPanel } from "./panels/ServiceHealthPanel";
import { QueueWorkerPanel } from "./panels/QueueWorkerPanel";
import { useOpsMetrics } from "./hooks/useOpsMetrics";

export function OpsDashboard() {
  const { snapshot, isLoading } = useOpsMetrics();

  if (isLoading) {
    return <div role="status">Loading operations overview…</div>;
  }

  return (
    <div role="region" aria-label="Operations dashboard">
      <ServiceHealthPanel services={snapshot.serviceHealth} />
      <QueueWorkerPanel
        queueDepth={snapshot.queueDepth}
        workerThroughputPerMin={snapshot.workerThroughputPerMin}
      />
    </div>
  );
}
