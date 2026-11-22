import { safeStorage } from '@/lib/local-storage';
/**
 * Mock persistence layer for collaborative triage documents (#2192).
 *
 * Simulates IndexedDB + Redis sync using localStorage in the browser.
 * In production, this would use y-indexeddb for offline support and
 * Redis for server-side persistence.
 */

const STORAGE_PREFIX = 'crashlab:triage-doc:';

export async function persistDoc(roomId: string, doc: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    safeStorage.setItem(STORAGE_PREFIX + roomId, JSON.stringify(doc));
  } catch {
    // Storage may be full or unavailable.
  }
}

export async function loadDoc(roomId: string): Promise<unknown | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeStorage.getItem(STORAGE_PREFIX + roomId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearDoc(roomId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    safeStorage.removeItem(STORAGE_PREFIX + roomId);
  } catch {
    // Ignore.
  }
}
