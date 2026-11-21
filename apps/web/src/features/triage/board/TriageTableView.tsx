// WIP scaffold for issue #2282. Virtualized server-side-filtered table view is not implemented yet.
"use client";

import type { TriageCardData } from "./cards/TriageCard";

export function TriageTableView({ items }: { items: TriageCardData[] }) {
  return (
    <table className="triage-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>State</th>
          <th>Owner</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.title}</td>
            <td>{item.state}</td>
            <td>{item.owner ?? "Unassigned"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
