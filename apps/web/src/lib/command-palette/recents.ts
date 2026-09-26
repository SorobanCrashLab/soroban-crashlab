import { safeStorage } from "../local-storage";

export const RECENTS_STORAGE_KEY = 'crashlab:command-palette-recents';
export const MAX_RECENT_COMMANDS = 10;

/**
 * Pure ordering logic for recent-command tracking: most-recently-used first,
 * deduplicated, capped at `max`. Split out from storage access so it can be
 * unit-tested without a DOM/localStorage environment.
 */
export function computeNextRecents(current: string[], id: string, max: number = MAX_RECENT_COMMANDS): string[] {
  return [id, ...current.filter((existing) => existing !== id)].slice(0, max);
}

function persist(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    safeStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode, quota) — recents simply won't persist */
  }
}

export function getRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecent(id: string): string[] {
  const next = computeNextRecents(getRecents(), id);
  persist(next);
  return next;
}

export function clearRecents(): string[] {
  persist([]);
  return [];
}
