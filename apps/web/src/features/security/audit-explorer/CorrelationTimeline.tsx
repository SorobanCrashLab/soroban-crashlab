// WIP scaffold for issue #2284. Cross-entity correlation graph/timeline not implemented yet.
"use client";

import type { AuditEventRow } from "./AuditTable";

export function CorrelationTimeline({ events }: { events: AuditEventRow[] }) {
  return (
    <ol aria-label="Correlated event timeline" className="correlation-timeline">
      {events.map((event) => (
        <li key={event.id}>
          {event.occurredAt} — {event.action}
        </li>
      ))}
    </ol>
  );
}
