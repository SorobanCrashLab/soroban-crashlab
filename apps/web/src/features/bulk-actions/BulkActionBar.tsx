// WIP scaffold for issue #2272.
"use client";

import type { SelectionState } from "./SelectionManager";
import { selectedCount } from "./SelectionManager";
import type { BulkActionDefinition } from "./ActionRegistry";

export function BulkActionBar({
  selection,
  pageSize,
  actions,
  onAction,
}: {
  selection: SelectionState;
  pageSize: number;
  actions: BulkActionDefinition[];
  onAction: (actionId: string) => void;
}) {
  const count = selectedCount(selection, pageSize);
  if (count === 0) return null;

  return (
    <div role="toolbar" aria-label="Bulk actions" className="bulk-action-bar">
      <span aria-live="polite">{count} selected</span>
      {actions.map((action) => (
        <button key={action.id} type="button" onClick={() => onAction(action.id)}>
          {action.label}
        </button>
      ))}
    </div>
  );
}
