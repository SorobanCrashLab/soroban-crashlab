// WIP scaffold for issue #2272. Not yet integrated with any virtualized table.
"use client";

import { useState } from "react";
import { emptySelection, type SelectionState } from "../SelectionManager";

export function useSelection(totalFilteredCount = 0) {
  const [selection, setSelection] = useState<SelectionState>(emptySelection(totalFilteredCount));

  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev.manualIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, mode: "manual", manualIds: next };
    });
  }

  function clear() {
    setSelection(emptySelection(totalFilteredCount));
  }

  return { selection, toggle, clear, setSelection };
}
