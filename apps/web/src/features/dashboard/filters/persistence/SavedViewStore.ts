/**
 * Saved view store — local persistence for filter views (#2194).
 *
 * Saved views persist the full AST plus metadata (name, description,
 * visibility). They are stored in localStorage and optionally synced
 * to the server API.
 */

import { safeStorage } from '@/lib/local-storage';
import type { FilterAST } from '../ast/FilterAST';

export type ViewVisibility = 'private' | 'team' | 'public';

export interface SavedView {
  id: string;
  name: string;
  description: string;
  ast: FilterAST;
  visibility: ViewVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'crashlab:saved-filter-views:v1';

function generateId(): string {
  return `view-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function readSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(views: SavedView[]): boolean {
  try {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

export function createSavedView(
  name: string,
  description: string,
  ast: FilterAST,
  visibility: ViewVisibility = 'private',
): SavedView {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    description,
    ast,
    visibility,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveView(view: SavedView): SavedView[] {
  const views = readSavedViews();
  const existing = views.findIndex((v) => v.id === view.id);
  if (existing >= 0) {
    views[existing] = { ...view, version: view.version + 1, updatedAt: new Date().toISOString() };
  } else {
    views.push(view);
  }
  writeSavedViews(views);
  return views;
}

export function deleteView(viewId: string): SavedView[] {
  const views = readSavedViews().filter((v) => v.id !== viewId);
  writeSavedViews(views);
  return views;
}

export function getView(viewId: string): SavedView | undefined {
  return readSavedViews().find((v) => v.id === viewId);
}

export function revertToVersion(viewId: string, _targetVersion: number): SavedView | null {
  // Version history is kept in the server-side store; for local-only,
  // we return the current view as-is.
  const view = getView(viewId);
  return view ?? null;
}
