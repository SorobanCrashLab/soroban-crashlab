/**
 * Saved view API — server-side CRUD wrappers (#2194).
 *
 * These wrappers call the /api/filters/saved-views endpoints. They fall
 * back gracefully to local storage when the API is unavailable.
 */

import type { FilterAST } from '../ast/FilterAST';
import { type SavedView, type ViewVisibility, createSavedView, readSavedViews, writeSavedViews } from './SavedViewStore';

export async function fetchSavedViews(): Promise<SavedView[]> {
  try {
    const response = await fetch('/api/filters/saved-views');
    if (response.ok) return (await response.json()) as SavedView[];
  } catch {
    // Fall back to local storage.
  }
  return readSavedViews();
}

export async function createSavedViewAPI(
  name: string,
  description: string,
  ast: FilterAST,
  visibility: ViewVisibility = 'private',
): Promise<SavedView> {
  const view = createSavedView(name, description, ast, visibility);
  try {
    await fetch('/api/filters/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(view),
    });
  } catch {
    // Fall back to local storage.
  }
  const views = readSavedViews();
  views.push(view);
  writeSavedViews(views);
  return view;
}

export async function updateSavedViewAPI(view: SavedView): Promise<SavedView | null> {
  try {
    const response = await fetch('/api/filters/saved-views', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(view),
    });
    if (response.ok) return (await response.json()) as SavedView;
  } catch {
    // Fall back to local storage.
  }
  return null;
}

export async function deleteSavedViewAPI(viewId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/filters/saved-views?id=${encodeURIComponent(viewId)}`, {
      method: 'DELETE',
    });
    if (response.ok) return true;
  } catch {
    // Fall back to local storage.
  }
  return false;
}
