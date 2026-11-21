// WIP scaffold for issue #2286. Mitigation actions (automation links, campaign pause,
// alert mute, rollback references) not implemented yet.
"use client";

import type { IncidentSummary } from "./hooks/useIncidents";
import type { TimelineEvent } from "./correlation/correlator";
import { IncidentTimeline } from "./IncidentTimeline";
import { WarRoomPanel } from "./WarRoomPanel";

export function IncidentDetail({
  incident,
  events,
}: {
  incident: IncidentSummary;
  events: TimelineEvent[];
}) {
  return (
    <div role="region" aria-label={`Incident ${incident.title}`}>
      <h2>{incident.title}</h2>
      <WarRoomPanel incident={incident} />
      <IncidentTimeline events={events} />
    </div>
  );
}
