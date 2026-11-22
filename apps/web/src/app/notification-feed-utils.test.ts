/**
 * Tests for the polled notification feed merge (#1077).
 *
 * The badge count is derived from the merged list, so these assertions are what
 * pin down "the unread count reflects the latest poll".
 */
import * as assert from 'node:assert/strict';
import {
  mergeNotificationFeed,
  countUnread,
  pruneDismissedIds,
  type MergeableNotification,
} from './notification-feed-utils';

interface FeedNotification extends MergeableNotification {
  title: string;
}

function item(id: string, read = false, title = id): FeedNotification {
  return { id, read, title };
}

function testCountUnread(): void {
  assert.equal(countUnread([]), 0);
  assert.equal(countUnread([item('a'), item('b')]), 2);
  assert.equal(countUnread([item('a', true), item('b')]), 1);
  assert.equal(countUnread([item('a', true), item('b', true)]), 0);
}

// The reported regression: polling the same feed used to append every already
// known notification a second time, so the badge climbed on every 30s tick.
function testRepeatedPollIsStable(): void {
  const feed = [item('n-1'), item('n-2'), item('n-3')];

  let state = mergeNotificationFeed<FeedNotification>([], feed);
  assert.equal(state.length, 3);
  assert.equal(countUnread(state), 3);

  // Poll again with an unchanged feed — nothing may be duplicated.
  state = mergeNotificationFeed(state, feed);
  assert.equal(state.length, 3);
  assert.equal(countUnread(state), 3);

  // And again, for good measure.
  state = mergeNotificationFeed(state, feed);
  assert.equal(state.length, 3);
  assert.equal(countUnread(state), 3);

  // Every id appears exactly once, so React keys stay unique.
  assert.equal(new Set(state.map((n) => n.id)).size, state.length);
}

function testBadgeTracksTheLatestFeed(): void {
  let state = mergeNotificationFeed<FeedNotification>([], [item('n-1')]);
  assert.equal(countUnread(state), 1);

  // A new notification arrives.
  state = mergeNotificationFeed(state, [item('n-2'), item('n-1')]);
  assert.equal(countUnread(state), 2);
  assert.deepEqual(state.map((n) => n.id), ['n-2', 'n-1']);

  // The server drops one; the badge follows it down.
  state = mergeNotificationFeed(state, [item('n-2')]);
  assert.equal(state.length, 1);
  assert.equal(countUnread(state), 1);

  // Feed empties out entirely.
  state = mergeNotificationFeed(state, []);
  assert.deepEqual(state, []);
  assert.equal(countUnread(state), 0);
}

function testLocalReadStateSurvivesPolling(): void {
  const initial = mergeNotificationFeed<FeedNotification>([], [item('n-1'), item('n-2')]);

  // User reads one; the server hasn't caught up.
  const afterRead = initial.map((n) => (n.id === 'n-1' ? { ...n, read: true } : n));
  assert.equal(countUnread(afterRead), 1);

  const afterPoll = mergeNotificationFeed(afterRead, [item('n-1'), item('n-2')]);
  assert.equal(countUnread(afterPoll), 1);
  assert.equal(afterPoll.find((n) => n.id === 'n-1')?.read, true);

  // The server marking something read is honoured too.
  const serverRead = mergeNotificationFeed(afterPoll, [item('n-1', true), item('n-2', true)]);
  assert.equal(countUnread(serverRead), 0);
}

function testServerOrderIsPreserved(): void {
  const state = mergeNotificationFeed<FeedNotification>(
    [item('old-1'), item('old-2')],
    [item('new-1'), item('old-2'), item('old-1')],
  );
  assert.deepEqual(state.map((n) => n.id), ['new-1', 'old-2', 'old-1']);
}

function testDismissedItemsDoNotReturn(): void {
  const feed = [item('n-1'), item('n-2')];
  let state = mergeNotificationFeed<FeedNotification>([], feed);
  assert.equal(countUnread(state), 2);

  // User dismisses one — the next poll must not resurrect it and re-inflate
  // the badge.
  const dismissed = new Set(['n-1']);
  state = state.filter((n) => n.id !== 'n-1');
  state = mergeNotificationFeed(state, feed, dismissed);

  assert.deepEqual(state.map((n) => n.id), ['n-2']);
  assert.equal(countUnread(state), 1);
}

function testDuplicateIdsFromServerCollapse(): void {
  const state = mergeNotificationFeed<FeedNotification>(
    [],
    [item('n-1', false, 'first'), item('n-1', false, 'second'), item('n-2')],
  );
  assert.equal(state.length, 2);
  assert.equal(state[0].title, 'first');
  assert.equal(countUnread(state), 2);
}

function testPruneDismissedIds(): void {
  const dismissed = new Set(['n-1', 'n-2', 'gone']);

  // Ids still in the feed must stay suppressed.
  const pruned = pruneDismissedIds(dismissed, [item('n-1'), item('n-3')]);
  assert.deepEqual([...pruned].sort(), ['n-1']);

  // Nothing live => the set empties, so it can't grow unbounded.
  assert.equal(pruneDismissedIds(dismissed, []).size, 0);

  // The original set is not mutated.
  assert.equal(dismissed.size, 3);
}

function testMergeIsImmutable(): void {
  const previous = [item('n-1', true)];
  const merged = mergeNotificationFeed(previous, [item('n-1')]);

  assert.notEqual(merged, previous);
  assert.equal(previous[0].read, true);
  assert.equal(merged[0].read, true);
  // Extra fields carried by the caller survive the merge.
  assert.equal(merged[0].title, 'n-1');
}

testCountUnread();
testRepeatedPollIsStable();
testBadgeTracksTheLatestFeed();
testLocalReadStateSurvivesPolling();
testServerOrderIsPreserved();
testDismissedItemsDoNotReturn();
testDuplicateIdsFromServerCollapse();
testPruneDismissedIds();
testMergeIsImmutable();

console.log('notification-feed-utils.test.ts: all assertions passed');
