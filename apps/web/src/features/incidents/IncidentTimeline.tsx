// WIP scaffold for issue #2286. Virtualized rendering for 10k+ correlated events pending.
"use client";

import type { TimelineEvent } from "./correlation/correlator";

export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol aria-label="Incident timeline" className="incident-timeline">
      {events.map((event) => (
        <li key={event.id}>
          {event.occurredAt} [{event.source}] {event.summary}
        </li>
      ))}
    </ol>
  );
}
