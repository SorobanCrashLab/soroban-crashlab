// WIP scaffold for issue #2271. Correlation across alerts/deploys/failures not implemented
// yet — see CorrelationView.tsx for the drill-down placeholder.
"use client";

export interface OpsTimelineEvent {
  id: string;
  occurredAt: string;
  summary: string;
}

export function IncidentTimelinePanel({ events }: { events: OpsTimelineEvent[] }) {
  return (
    <ol aria-label="Incident timeline" className="incident-timeline-panel">
      {events.map((event) => (
        <li key={event.id}>
          {event.occurredAt} — {event.summary}
        </li>
      ))}
    </ol>
  );
}
