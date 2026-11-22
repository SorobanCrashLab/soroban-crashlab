// WIP scaffold for issue #2286. Owners/tasks/status updates/comms links not implemented yet.
"use client";

import type { IncidentSummary } from "./hooks/useIncidents";

export function WarRoomPanel({ incident }: { incident: IncidentSummary }) {
  return (
    <section aria-label="War room" className="war-room-panel">
      <p>Owner: {incident.owner ?? "Unassigned"}</p>
      <p>Status: {incident.status}</p>
    </section>
  );
}
