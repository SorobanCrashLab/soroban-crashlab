'use client';

import { useState, useCallback, useEffect } from 'react';
import type { FilterAST } from '../ast/FilterAST';
import { type SavedView, type ViewVisibility, readSavedViews, saveView, deleteView } from '../persistence/SavedViewStore';

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    setIsLoading(true);
    const stored = readSavedViews();
    setViews(stored);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createView = useCallback(
    (name: string, description: string, ast: FilterAST, visibility: ViewVisibility = 'private') => {
      const { createSavedView } = require('../persistence/SavedViewStore');
      const view = createSavedView(name, description, ast, visibility);
      const updated = saveView(view);
      setViews(updated);
      return view;
    },
    [],
  );

  const removeView = useCallback((viewId: string) => {
    const updated = deleteView(viewId);
    setViews(updated);
  }, []);

  return { views, isLoading, createView, removeView, refresh };
}
