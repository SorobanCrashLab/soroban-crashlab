// WIP scaffold for issue #2286. Filters (status/severity/owner/service/age) and SLA
// indicators are not implemented yet.
"use client";

import type { IncidentSummary } from "./hooks/useIncidents";

export function IncidentList({ incidents }: { incidents: IncidentSummary[] }) {
  return (
    <ul aria-label="Incident list" className="incident-list">
      {incidents.map((incident) => (
        <li key={incident.id}>
          <strong>{incident.title}</strong> — {incident.status} ({incident.severity})
        </li>
      ))}
    </ul>
  );
}
