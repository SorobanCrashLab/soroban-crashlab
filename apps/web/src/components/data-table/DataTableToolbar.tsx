// WIP scaffold for issue #2279. Bulk-action integration (#051) not wired up yet.
"use client";

import type { ReactNode } from "react";

export function DataTableToolbar({ children }: { children?: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Table toolbar" className="data-table-toolbar">
      {children}
    </div>
  );
}
