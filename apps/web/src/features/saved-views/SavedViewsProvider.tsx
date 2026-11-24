// WIP scaffold for issue #2273 (Saved Views & Shareable Workspace Links). Not wired to
// real persistence yet — see docs/frontend/saved-views.md.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSavedViews } from "./hooks/useSavedViews";

type SavedViewsContextValue = ReturnType<typeof useSavedViews>;

const SavedViewsContext = createContext<SavedViewsContextValue | null>(null);

export function SavedViewsProvider({ page, children }: { page: string; children: ReactNode }) {
  const value = useSavedViews(page);
  return <SavedViewsContext.Provider value={value}>{children}</SavedViewsContext.Provider>;
}

export function useSavedViewsContext(): SavedViewsContextValue {
  const context = useContext(SavedViewsContext);
  if (!context) throw new Error("useSavedViewsContext must be used within a SavedViewsProvider");
  return context;
}
