// WIP scaffold for issue #2282 (Triage Workflow Board). Kanban/drag-drop, filters, bulk actions,
// and real-time updates are not implemented yet — see docs/triage/workflow-board.md.
"use client";

import { BOARD_COLUMNS } from "./columns";
import { TriageCard } from "./cards/TriageCard";
import { useTriageBoard } from "./hooks/useTriageBoard";

export function TriageBoard() {
  const { items, isLoading } = useTriageBoard();

  if (isLoading) {
    return <div role="status">Loading triage board…</div>;
  }

  return (
    <div className="triage-board" role="region" aria-label="Triage workflow board">
      {BOARD_COLUMNS.map((column) => (
        <div key={column.state} className="triage-board__column" aria-label={column.label}>
          <h3>{column.label}</h3>
          {items
            .filter((item) => item.state === column.state)
            .map((item) => (
              <TriageCard key={item.id} item={item} />
            ))}
        </div>
      ))}
    </div>
  );
}
