// WIP scaffold for issue #2284. Raw payload / normalized field / related-events display pending.
"use client";

import type { AuditEventRow } from "./AuditTable";

export function AuditEventDrawer({ event }: { event: AuditEventRow | null }) {
  if (!event) return null;

  return (
    <aside aria-label="Audit event detail" className="audit-event-drawer">
      <h3>{event.action}</h3>
      <pre>{JSON.stringify(event, null, 2)}</pre>
    </aside>
  );
}
