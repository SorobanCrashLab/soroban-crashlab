// WIP scaffold for issue #2284. Persistence for saved/shareable queries not implemented yet.
"use client";

import type { AuditFilterState } from "./AuditFilters";

export interface SavedAuditQuery {
  id: string;
  name: string;
  filters: AuditFilterState;
}

export function SavedAuditQueries({ queries }: { queries: SavedAuditQuery[] }) {
  return (
    <ul aria-label="Saved audit queries" className="saved-audit-queries">
      {queries.map((query) => (
        <li key={query.id}>{query.name}</li>
      ))}
    </ul>
  );
}
