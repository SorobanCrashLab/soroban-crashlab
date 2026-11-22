// WIP scaffold for issue #2273 (Saved Views & Shareable Workspace Links). Generalizes the
// existing runs-only view state (apps/web/src/app/saved-views/view-state.ts) to a
// cross-page schema; that existing module is not migrated onto this yet.

export type ViewScope = "private" | "team" | "workspace";

export interface SavedViewRecord {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  scope: ViewScope;
  page: string;
  ownerId: string;
  query: Record<string, unknown>;
  layout: Record<string, unknown>;
  columns: string[];
  createdAt: string;
  updatedAt: string;
}

export function createDraftView(page: string, ownerId: string): SavedViewRecord {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    tags: [],
    scope: "private",
    page,
    ownerId,
    query: {},
    layout: {},
    columns: [],
    createdAt: now,
    updatedAt: now,
  };
}
