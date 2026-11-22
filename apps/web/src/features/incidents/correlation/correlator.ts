// WIP scaffold for issue #2286 (Incident Command Center). Correlating alerts/run
// failures/regressions/deployment markers/webhook events is not implemented yet.

export interface TimelineEvent {
  id: string;
  source: "alert" | "run" | "regression" | "deployment" | "webhook";
  occurredAt: string;
  summary: string;
}

export function correlateEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}
