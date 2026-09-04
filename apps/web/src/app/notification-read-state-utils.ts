/**
 * Notification read-state persistence and cross-tab merge (#1359).
 *
 * Each notification id is mapped to a `readAt` timestamp (ms since epoch).
 * Timestamps enable merge-on-write: a stale tab that hasn't seen a newer
 * mutation will not resurrect items that another tab has already marked read.
 *
 * All helpers are pure or SSR-safe — they never touch localStorage during
 * prerender.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Record of notification id → monotonic read timestamp. */
export type ReadState = Record<string, number>;

// ---------------------------------------------------------------------------
// Storage key & SSR guard
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'notification-read-state';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

// ---------------------------------------------------------------------------
// Persistence (SSR-safe)
// ---------------------------------------------------------------------------

export function loadReadState(): ReadState {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ReadState;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveReadState(state: ReadState): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or security error — silently ignore; badge may be stale.
  }
}

export function markNotificationRead(
  id: string,
  existing?: ReadState,
): ReadState {
  const now = Date.now();
  const prev = existing ?? loadReadState();
  // Only update if this is genuinely a newer timestamp (monotonic).
  if (prev[id] && prev[id] >= now) return prev;
  const next = { ...prev, [id]: now };
  saveReadState(next);
  return next;
}

export function markAllNotificationsRead(
  ids: readonly string[],
  existing?: ReadState,
): ReadState {
  const now = Date.now();
  const prev = existing ?? loadReadState();
  let changed = false;
  const next = { ...prev };
  for (const id of ids) {
    if (!next[id] || next[id] < now) {
      next[id] = now;
      changed = true;
    }
  }
  if (changed) saveReadState(next);
  return next;
}

// ---------------------------------------------------------------------------
// Merge-on-write
// ---------------------------------------------------------------------------

/**
 * Reconcile a *local* (possibly stale) read state with an *incoming* one
 * produced by another tab or a server poll.
 *
 * **Resurrection guard**: if the local state says `id` was read at `T1` and
 * the incoming state says `id` is unread (absent or read=false), the merge
 * keeps the read status — the `readAt` timestamp is the source of truth.
 *
 * If both sides have a readAt for the same id the **later** timestamp wins
 * (which still keeps it read; this is a set-only flag).
 *
 * Returns the merged ReadState (also persisted to localStorage).
 */
export function mergeReadState(
  local: ReadState,
  incoming: ReadState,
): ReadState {
  const merged: ReadState = { ...incoming };
  let changed = false;

  for (const [id, ts] of Object.entries(local)) {
    const existing = merged[id];
    if (!existing || ts > existing) {
      // Local read is newer — keep it (prevents resurrection).
      merged[id] = ts;
      changed = true;
    }
    // else: incoming is newer or equal — it already has the read marker.
  }

  if (changed) saveReadState(merged);
  return merged;
}

/**
 * Given a read state and a notification that has `read: boolean`,
 * return the resolved read flag — `readAt` timestamp presence trumps the
 * boolean.  A notification is unread only when there is no readAt entry.
 */
export function isNotificationRead(
  readState: ReadState,
  notificationId: string,
  serverRead: boolean,
): boolean {
  if (readState[notificationId]) return true;
  return serverRead;
}

/**
 * Count unread notifications, respecting the merged read state.
 */
export function countUnreadWithReadState<T extends { id: string; read: boolean }>(
  notifications: readonly T[],
  readState: ReadState,
): number {
  return notifications.reduce(
    (total, n) => (isNotificationRead(readState, n.id, n.read) ? total : total + 1),
    0,
  );
}

// ---------------------------------------------------------------------------
// Cross-tab subscription
// ---------------------------------------------------------------------------

type ReadStateChangeCallback = (newState: ReadState) => void;

/**
 * Subscribe to `storage` events on the read-state key.
 * Returns an unsubscribe function.  No-op on the server.
 */
export function subscribeToReadStateChanges(
  callback: ReadStateChangeCallback,
): () => void {
  if (!isBrowser()) return () => {};

  const handler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      const parsed: unknown = event.newValue ? JSON.parse(event.newValue) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        callback(parsed as ReadState);
      }
    } catch {
      // Corrupt storage value — ignore.
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
