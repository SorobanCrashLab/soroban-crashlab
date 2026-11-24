// WIP scaffold for issue #2284. TODO: replace with real search/filter/live-tail data fetching.
"use client";

import { useState } from "react";
import type { AuditFilterState } from "../AuditFilters";
import type { AuditEventRow } from "../AuditTable";

export function useAuditExplorer() {
  const [filters, setFilters] = useState<AuditFilterState>({});
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [selected, setSelected] = useState<AuditEventRow | null>(null);

  return { filters, setFilters, events, setEvents, selected, setSelected };
}
