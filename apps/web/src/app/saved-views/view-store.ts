/**
 * Typed gateway for named saved views (#1430).
 *
 * Views are per-browser: they hold a person's working layout, not shared
 * configuration. Sharing happens through the encoded URL, not this store.
 */

import { encodeViewState, type ViewState } from './view-state';
import { safeStorage } from "@/lib/local-storage";

export const SAVED_VIEWS_STORAGE_KEY = 'crashlab:saved-views:v1';

export interface SavedView {
  id: string;
  name: string;
  /** Encoded querystring, so a stored view survives state-shape changes. */
  encoded: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewGateway {
  list(): SavedView[];
  save(views: readonly SavedView[]): void;
}

export function parseSavedViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function createLocalSavedViewGateway(): SavedViewGateway {
  return {
    list: () =>
      typeof window === 'undefined'
        ? []
        : parseSavedViews(safeStorage.getItem(SAVED_VIEWS_STORAGE_KEY)),
    save: (views) => {
      if (typeof window === 'undefined') {
        throw new Error('Saved views are only available in the browser');
      }
      safeStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
    },
  };
}

export function createSavedView(
  name: string,
  state: ViewState,
  now: string,
  id = `view-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
): SavedView {
  return { id, name: name.trim(), encoded: encodeViewState(state), createdAt: now, updatedAt: now };
}

export function addView(views: readonly SavedView[], view: SavedView): SavedView[] {
  return [...views, view];
}

export function deleteView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}

export function renameView(
  views: readonly SavedView[],
  id: string,
  name: string,
  now: string,
): SavedView[] {
  const trimmed = name.trim();
  if (!trimmed) return [...views];
  return views.map((view) =>
    view.id === id ? { ...view, name: trimmed, updatedAt: now } : view,
  );
}

export function validateViewName(name: string, existing: readonly SavedView[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'View name cannot be empty';
  if (trimmed.length > 60) return 'View name cannot exceed 60 characters';
  if (existing.some((view) => view.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'A view with that name already exists';
  }
  return null;
}
