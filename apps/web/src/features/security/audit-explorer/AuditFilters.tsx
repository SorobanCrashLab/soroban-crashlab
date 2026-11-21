// WIP scaffold for issue #2284 (Audit Log Explorer). Saved searches/shareable links not implemented.
"use client";

export interface AuditFilterState {
  actor?: string;
  actionType?: string;
  resourceType?: string;
  outcome?: "success" | "failure" | "all";
  from?: string;
  to?: string;
}

export function AuditFilters({
  value,
  onChange,
}: {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
}) {
  return (
    <form className="audit-filters" aria-label="Audit log filters">
      <label>
        Actor
        <input
          value={value.actor ?? ""}
          onChange={(event) => onChange({ ...value, actor: event.target.value })}
        />
      </label>
      <label>
        Resource type
        <input
          value={value.resourceType ?? ""}
          onChange={(event) => onChange({ ...value, resourceType: event.target.value })}
        />
      </label>
    </form>
  );
}
