// WIP scaffold for issue #2284 (Audit Log Explorer). Complements the existing
// app/audit route; this module adds correlation/diff/saved-query pieces that don't exist yet.
// Not wired into a route.
"use client";

import { AuditFilters } from "./AuditFilters";
import { AuditTable } from "./AuditTable";
import { AuditEventDrawer } from "./AuditEventDrawer";
import { useAuditExplorer } from "./hooks/useAuditExplorer";

export function AuditExplorer() {
  const { filters, setFilters, events, selected } = useAuditExplorer();

  return (
    <div className="audit-explorer" role="region" aria-label="Audit log explorer">
      <AuditFilters value={filters} onChange={setFilters} />
      <AuditTable events={events} />
      <AuditEventDrawer event={selected} />
    </div>
  );
}
