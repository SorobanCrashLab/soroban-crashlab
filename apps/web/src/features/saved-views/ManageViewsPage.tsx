// WIP scaffold for issue #2273. Search/filter/archive controls not implemented yet.
"use client";

import type { SavedViewRecord } from "./viewSchema";

export function ManageViewsPage({ views }: { views: SavedViewRecord[] }) {
  return (
    <table aria-label="Manage saved views" className="manage-views-page">
      <thead>
        <tr>
          <th>Name</th>
          <th>Scope</th>
          <th>Page</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {views.map((view) => (
          <tr key={view.id}>
            <td>{view.name}</td>
            <td>{view.scope}</td>
            <td>{view.page}</td>
            <td>{view.updatedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
