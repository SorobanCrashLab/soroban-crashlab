// WIP scaffold for issue #2271. Correlation across impacted runs/campaigns not
// implemented yet.
"use client";

import type { OpsTimelineEvent } from "../panels/IncidentTimelinePanel";

export function CorrelationView({ events }: { events: OpsTimelineEvent[] }) {
  return (
    <div aria-label="Correlation view" className="correlation-view">
      <p>{events.length} correlated events.</p>
    </div>
  );
}
