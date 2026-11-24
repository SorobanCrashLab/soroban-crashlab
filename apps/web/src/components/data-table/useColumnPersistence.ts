// WIP scaffold for issue #2279. Persists only visibility/order to localStorage; resize/pin
// persistence and server-side saved presets are not implemented yet.
"use client";

import { useState } from "react";

export interface ColumnPrefs {
  visibleIds: string[];
  order: string[];
}

function storageKey(tableId: string): string {
  return `crashlab:table-columns:${tableId}`;
}

export function useColumnPersistence(tableId: string, defaults: ColumnPrefs) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(tableId));
      return raw ? (JSON.parse(raw) as ColumnPrefs) : defaults;
    } catch {
      return defaults;
    }
  });

  function update(next: ColumnPrefs) {
    setPrefs(next);
    try {
      window.localStorage.setItem(storageKey(tableId), JSON.stringify(next));
    } catch {
      // best-effort
    }
  }

  return { prefs, update };
}
