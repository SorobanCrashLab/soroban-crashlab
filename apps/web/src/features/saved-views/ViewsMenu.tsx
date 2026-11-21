// WIP scaffold for issue #2273. Pin/favorite and default-view selection not implemented yet.
"use client";

import type { SavedViewRecord } from "./viewSchema";

export function ViewsMenu({
  views,
  onSelect,
}: {
  views: SavedViewRecord[];
  onSelect: (view: SavedViewRecord) => void;
}) {
  return (
    <ul aria-label="Saved views" className="views-menu">
      {views.map((view) => (
        <li key={view.id}>
          <button type="button" onClick={() => onSelect(view)}>
            {view.name} ({view.scope})
          </button>
        </li>
      ))}
    </ul>
  );
}
