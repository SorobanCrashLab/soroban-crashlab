// WIP scaffold for issue #2286 (Incident Command Center). Not wired to real alert/run/
// webhook data or SSE yet — see docs/ops/incident-command-center.md.
"use client";

import { IncidentList } from "./IncidentList";
import { useIncidents } from "./hooks/useIncidents";

export function IncidentCommandCenter() {
  const { incidents, isLoading } = useIncidents();

  if (isLoading) {
    return <div role="status">Loading incidents…</div>;
  }

  return (
    <div role="region" aria-label="Incident command center">
      <IncidentList incidents={incidents} />
    </div>
  );
}
