// WIP scaffold for issue #2273. TODO: back with /api/saved-views instead of local-only state.
"use client";

import { useState } from "react";
import type { SavedViewRecord } from "../viewSchema";

export function useSavedViews(page: string) {
  const [views, setViews] = useState<SavedViewRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const viewsForPage = views.filter((view) => view.page === page);

  return { views: viewsForPage, setViews, isLoading, setIsLoading };
}
