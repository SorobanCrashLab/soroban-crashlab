// WIP scaffold for issue #2272 (Bulk Operations Framework). Not wired to any real table
// yet — see docs for existing runs-only logic this is meant to eventually replace.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSelection } from "./hooks/useSelection";
import { useBulkActions } from "./hooks/useBulkActions";

type BulkActionsContextValue = ReturnType<typeof useSelection> & ReturnType<typeof useBulkActions>;

const BulkActionsContext = createContext<BulkActionsContextValue | null>(null);

export function BulkActionsProvider({
  totalFilteredCount,
  children,
}: {
  totalFilteredCount?: number;
  children: ReactNode;
}) {
  const selectionApi = useSelection(totalFilteredCount);
  const actionsApi = useBulkActions();

  return (
    <BulkActionsContext.Provider value={{ ...selectionApi, ...actionsApi }}>
      {children}
    </BulkActionsContext.Provider>
  );
}

export function useBulkActionsContext(): BulkActionsContextValue {
  const context = useContext(BulkActionsContext);
  if (!context) throw new Error("useBulkActionsContext must be used within a BulkActionsProvider");
  return context;
}
