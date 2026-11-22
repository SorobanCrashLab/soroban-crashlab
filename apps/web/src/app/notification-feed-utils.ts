/**
 * Pure merge logic for the polled notification feed.
 *
 * Fixes #1077: the notification centre re-polls `/notifications` every 30s and
 * merged the response into local state by seeding the result with the surviving
 * previous entries and *then* appending every mapped incoming item — so any
 * notification present in both copies was pushed twice. The list grew on every
 * poll and the unread badge counted the same notification repeatedly, so the
 * count never settled on the true value. Locally dismissed items also came back
 * on the next poll, bumping the badge again.
 *
 * The merge is expressed here, free of React, so the counting rules are
 * unit-testable with the repo's tsc + node harness.
 */

/** The fields the merge reasons about; callers may carry any extra data. */
export interface MergeableNotification {
  id: string;
  read: boolean;
}

/**
 * Reconcile a freshly fetched feed with what is already on screen.
 *
 * - Server order is preserved, so newest-first stays newest-first.
 * - Each id appears exactly once, which is what keeps React keys unique and the
 *   unread badge honest.
 * - A notification the user has read stays read even if the server has not
 *   caught up yet, so the badge never counts backwards.
 * - Items missing from the feed are dropped, and locally dismissed ids stay
 *   dismissed instead of reappearing on the next poll.
 */
export function mergeNotificationFeed<T extends MergeableNotification>(
  previous: readonly T[],
  incoming: readonly T[],
  dismissedIds: ReadonlySet<string> = new Set(),
): T[] {
  const readLocally = new Set(previous.filter((n) => n.read).map((n) => n.id));

  const merged: T[] = [];
  const seen = new Set<string>();

  for (const item of incoming) {
    // Defensive: a duplicated id from the server must not become two rows.
    if (seen.has(item.id)) continue;
    if (dismissedIds.has(item.id)) continue;
    seen.add(item.id);

    // Local read state wins; the server may not have recorded it yet.
    merged.push(readLocally.has(item.id) && !item.read ? { ...item, read: true } : item);
  }

  return merged;
}

/** Unread total behind the badge. */
export function countUnread(notifications: readonly MergeableNotification[]): number {
  return notifications.reduce((total, n) => (n.read ? total : total + 1), 0);
}

/**
 * Forget dismissed ids the server has stopped sending, so the set doesn't grow
 * without bound over a long-lived session.
 */
export function pruneDismissedIds(
  dismissedIds: ReadonlySet<string>,
  incoming: readonly MergeableNotification[],
): Set<string> {
  const live = new Set(incoming.map((n) => n.id));
  const pruned = new Set<string>();
  for (const id of dismissedIds) {
    if (live.has(id)) pruned.add(id);
  }
  return pruned;
}
