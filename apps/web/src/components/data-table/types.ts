// WIP scaffold for issue #2279 (Unified Data Table Platform). Not yet built on TanStack
// Table — that dependency hasn't been added.
import type { ReactNode } from "react";

export interface ColumnDef<TRow> {
  id: string;
  header: string;
  accessor: (row: TRow) => ReactNode;
  sortable?: boolean;
}

export interface SortState {
  columnId: string;
  direction: "asc" | "desc";
}

export interface TableQueryState {
  sort?: SortState;
  filters: Record<string, string>;
  cursor?: string;
  limit: number;
}
