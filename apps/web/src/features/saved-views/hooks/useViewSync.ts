// WIP scaffold for issue #2273. Restores view state from the URL on mount; does not yet
// push state changes back to the URL (no flicker-free two-way sync).
"use client";

import { useEffect, useState } from "react";
import { decodeViewFromQuery } from "../urlCodec";
import type { SavedViewRecord } from "../viewSchema";

export function useViewSync() {
  const [restored, setRestored] = useState<Partial<SavedViewRecord> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRestored(decodeViewFromQuery(window.location.search));
  }, []);

  return { restored };
}
