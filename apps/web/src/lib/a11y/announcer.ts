/**
 * Screen-reader announcement bus (#1884).
 *
 * Flow-level SR failures usually come from ad-hoc live regions: messages are
 * set before the region is mounted, identical messages never re-announce, or
 * multiple features overwrite each other. This module is the single place
 * that owns that behaviour:
 *  - empty messages are ignored,
 *  - consecutive duplicates inside a short window are collapsed,
 *  - every accepted message gets a monotonically increasing id so a renderer
 *    can force a DOM change even when the text is identical,
 *  - history is bounded.
 *
 * The React binding lives in `components/a11y/ScreenReaderAnnouncer.tsx`;
 * this part is pure so it can be unit-tested without a DOM.
 */

export type AnnouncementPoliteness = 'polite' | 'assertive';

export interface Announcement {
  id: number;
  message: string;
  politeness: AnnouncementPoliteness;
  at: number;
}

export interface AnnounceOptions {
  politeness?: AnnouncementPoliteness;
  /** Window in which an identical message is suppressed. Default 1500ms. */
  dedupeWindowMs?: number;
}

export interface Announcer {
  announce(message: string, options?: AnnounceOptions): Announcement | null;
  subscribe(listener: (announcement: Announcement) => void): () => void;
  getCurrent(politeness?: AnnouncementPoliteness): Announcement | null;
  getHistory(): readonly Announcement[];
  clear(): void;
}

export const DEFAULT_DEDUPE_WINDOW_MS = 1_500;
export const DEFAULT_MAX_HISTORY = 50;

/** Collapses whitespace so visually identical messages dedupe correctly. */
export function normalizeAnnouncement(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

export function createAnnouncer(deps: {
  now?: () => number;
  maxHistory?: number;
} = {}): Announcer {
  const now = deps.now ?? (() => Date.now());
  const maxHistory = Math.max(1, deps.maxHistory ?? DEFAULT_MAX_HISTORY);
  const history: Announcement[] = [];
  let nextId = 1;
  const listeners = new Set<(announcement: Announcement) => void>();

  function announce(message: string, options: AnnounceOptions = {}): Announcement | null {
    const normalized = normalizeAnnouncement(message);
    if (normalized.length === 0) return null;

    const politeness = options.politeness ?? 'polite';
    const dedupeWindow = Math.max(0, options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS);
    const at = now();
    const previous = history[history.length - 1];
    if (
      previous &&
      previous.politeness === politeness &&
      previous.message === normalized &&
      at - previous.at < dedupeWindow
    ) {
      return null;
    }

    const announcement: Announcement = { id: nextId, message: normalized, politeness, at };
    nextId += 1;
    history.push(announcement);
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

    for (const listener of listeners) listener(announcement);
    return announcement;
  }

  return {
    announce,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getCurrent(politeness) {
      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (politeness === undefined || history[index].politeness === politeness) {
          return history[index];
        }
      }
      return null;
    },
    getHistory() {
      return [...history];
    },
    clear() {
      history.length = 0;
    },
  };
}
