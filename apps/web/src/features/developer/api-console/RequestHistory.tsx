// WIP scaffold for issue #2285. Persistence/replay/export not implemented yet.
"use client";

export interface HistoryEntry {
  id: string;
  method: string;
  path: string;
  executedAt: string;
}

export function RequestHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ul aria-label="Request history" className="request-history">
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.method} {entry.path} — {entry.executedAt}
        </li>
      ))}
    </ul>
  );
}
