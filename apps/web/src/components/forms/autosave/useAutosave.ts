// WIP scaffold for issue #2278. Debouncing and "last saved" indicator wiring pending.
"use client";

import { useEffect } from "react";
import { saveDraft } from "./DraftStore";

export function useAutosave(formId: string, values: unknown, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    saveDraft(formId, values);
  }, [formId, values, enabled]);
}
