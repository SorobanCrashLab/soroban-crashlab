// WIP scaffold for issue #2283. Retry-failed-sync action not implemented yet.
"use client";

export interface SyncHistoryEntry {
  id: string;
  occurredAt: string;
  outcome: "success" | "conflict" | "failed";
}

export function SyncHistory({ entries }: { entries: SyncHistoryEntry[] }) {
  return (
    <ul aria-label="Sync history" className="sync-history">
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.occurredAt}: {entry.outcome}
        </li>
      ))}
    </ul>
  );
}
