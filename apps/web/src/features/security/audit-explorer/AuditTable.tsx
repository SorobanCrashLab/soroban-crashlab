// WIP scaffold for issue #2284. Virtualization and cursor-based pagination not implemented yet.
"use client";

export interface AuditEventRow {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: "success" | "failure";
  occurredAt: string;
}

export function AuditTable({ events }: { events: AuditEventRow[] }) {
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Outcome</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>{event.occurredAt}</td>
            <td>{event.actor}</td>
            <td>{event.action}</td>
            <td>
              {event.resourceType}/{event.resourceId}
            </td>
            <td>{event.outcome}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
