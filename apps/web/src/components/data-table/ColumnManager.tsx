// WIP scaffold for issue #2279. Reorder/resize/pin UI not implemented yet — visibility toggle only.
"use client";

import type { ColumnDef } from "./types";
import type { ColumnPrefs } from "./useColumnPersistence";

export function ColumnManager<TRow>({
  columns,
  prefs,
  onChange,
}: {
  columns: Array<ColumnDef<TRow>>;
  prefs: ColumnPrefs;
  onChange: (prefs: ColumnPrefs) => void;
}) {
  return (
    <div aria-label="Column manager" className="column-manager">
      {columns.map((column) => {
        const visible = prefs.visibleIds.includes(column.id);
        return (
          <label key={column.id}>
            <input
              type="checkbox"
              checked={visible}
              onChange={() =>
                onChange({
                  ...prefs,
                  visibleIds: visible
                    ? prefs.visibleIds.filter((id) => id !== column.id)
                    : [...prefs.visibleIds, column.id],
                })
              }
            />
            {column.header}
          </label>
        );
      })}
    </div>
  );
}
