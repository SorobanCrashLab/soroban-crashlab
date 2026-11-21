// WIP scaffold for issue #2279. URL state sync (see #056 in the issue) is not wired up yet.
"use client";

import { useState } from "react";
import type { TableQueryState } from "./types";

export function useServerTableState(initial: TableQueryState) {
  const [state, setState] = useState<TableQueryState>(initial);

  function setSort(columnId: string, direction: "asc" | "desc") {
    setState((prev) => ({ ...prev, sort: { columnId, direction } }));
  }

  function setFilter(key: string, value: string) {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, [key]: value } }));
  }

  return { state, setSort, setFilter, setState };
}
