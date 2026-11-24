// WIP scaffold for issue #2279 (Unified Data Table Platform). No virtualization, sticky
// headers, row expansion, or density modes yet — plain table markup only.
"use client";

import type { ColumnDef } from "./types";

export function DataTable<TRow extends { id: string }>({
  columns,
  rows,
  isLoading,
}: {
  columns: Array<ColumnDef<TRow>>;
  rows: TRow[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div role="status">Loading…</div>;
  }

  if (rows.length === 0) {
    return <div role="status">No rows to display.</div>;
  }

  return (
    <table role="grid" aria-label="Data table" className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.id} scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column.id}>{column.accessor(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
