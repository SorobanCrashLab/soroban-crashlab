/**
 * Tests for notification read-state persistence and cross-tab merge (#1359).
 *
 * Covers: merge-on-write, resurrection guard, monotonic timestamps,
 * isNotificationRead, countUnreadWithReadState, and persistence helpers.
 *
 * Uses the repo's tsc + node harness (no vitest).
 */
import * as assert from 'node:assert/strict';
import {
  mergeReadState,
  isNotificationRead,
  countUnreadWithReadState,
  type ReadState,
} from './notification-read-state-utils';

// ── mergeReadState ─────────────────────────────────────────────────────────

function testEmptyMerge(): void {
  const result = mergeReadState({}, {});
  assert.deepEqual(result, {});
}

function testLocalReadsArePreserved(): void {
  const local: ReadState = { n1: 1000, n2: 2000 };
  const incoming: ReadState = {};
  const merged = mergeReadState(local, incoming);
  assert.equal(merged.n1, 1000);
  assert.equal(merged.n2, 2000);
}

function testIncomingReadsAreAdopted(): void {
  const local: ReadState = {};
  const incoming: ReadState = { n1: 3000 };
  const merged = mergeReadState(local, incoming);
  assert.equal(merged.n1, 3000);
}

function testLaterTimestampWins(): void {
  const local: ReadState = { n1: 1000 };
  const incoming: ReadState = { n1: 5000 };
  const merged = mergeReadState(local, incoming);
  assert.equal(merged.n1, 5000);
}

// ── Resurrection guard (critical scenario) ─────────────────────────────────

function testResurrectionPrevented(): void {
  // Tab A marks n1 as read.
  const tabA: ReadState = { n1: 5000 };
  // Tab B has an older in-memory copy where n1 is NOT in read state.
  const tabB: ReadState = {};

  // Tab B's stale state merges with tab A's state — n1 must NOT be resurrected.
  const merged = mergeReadState(tabA, tabB);
  assert.ok(merged.n1, 'n1 must remain in read state');
  assert.equal(merged.n1, 5000);
}

function testResurrectionPreventedEvenWithEmptyIncoming(): void {
  // Tab A read n1, but the incoming poll from a lagging server has no read
  // record for n1.
  const local: ReadState = { n1: 9000 };
  const incoming: ReadState = {};
  const merged = mergeReadState(local, incoming);
  assert.equal(merged.n1, 9000, 'Local read must survive an empty incoming state');
}

function testResurrectionPreventedScenario(): void {
  // Full scenario from the issue:
  // 1. Both tabs load; n1 and n2 are unread.
  // 2. Tab A marks n1 as read → writes { n1: T1 } to storage.
  // 3. Tab B still has empty read state in memory.
  // 4. Tab B merges its (empty) local state with the (empty) incoming state
  //    from a stale poll — but the storage event should fire and Tab B
  //    should pick up { n1: T1 }.
  //
  // This test simulates step 4: merging stale local state with new storage
  // state that was written by another tab.
  const tabAAfterRead: ReadState = { n1: 10000 };
  // Tab B is stale — its local read state is empty.
  const tabBLocal: ReadState = {};
  // Tab B receives Tab A's storage event.
  const storageFromTabA: ReadState = tabAAfterRead;
  // Merging Tab B's local with storage event.
  const merged = mergeReadState(tabBLocal, storageFromTabA);
  assert.equal(merged.n1, 10000);
  // Verify the unread count computation would be correct.
  const notifications = [
    { id: 'n1', read: false },
    { id: 'n2', read: false },
  ];
  assert.equal(countUnreadWithReadState(notifications, merged), 1);
}

// ── isNotificationRead ─────────────────────────────────────────────────────

function testIsNotificationReadWithReadState(): void {
  const rs: ReadState = { n1: 1000 };
  assert.equal(isNotificationRead(rs, 'n1', false), true);
  assert.equal(isNotificationRead(rs, 'n2', false), false);
}

function testIsNotificationReadServerConfirmed(): void {
  const rs: ReadState = {};
  assert.equal(isNotificationRead(rs, 'n1', true), true);
}

function testIsNotificationReadNeitherRead(): void {
  const rs: ReadState = {};
  assert.equal(isNotificationRead(rs, 'n1', false), false);
}

function testIsNotificationReadReadStateOverridesServerUnread(): void {
  const rs: ReadState = { n1: 5000 };
  // Server says unread, but local read state says read → still read.
  assert.equal(isNotificationRead(rs, 'n1', false), true);
}

// ── countUnreadWithReadState ───────────────────────────────────────────────

function testCountUnreadWithReadState(): void {
  const notifications = [
    { id: 'a', read: false },
    { id: 'b', read: false },
    { id: 'c', read: true },
  ];
  const rs: ReadState = { a: 1000 };
  assert.equal(countUnreadWithReadState(notifications, rs), 1);
}

function testCountUnreadAllRead(): void {
  const notifications = [
    { id: 'a', read: false },
    { id: 'b', read: false },
  ];
  const rs: ReadState = { a: 1000, b: 2000 };
  assert.equal(countUnreadWithReadState(notifications, rs), 0);
}

function testCountUnreadNoneRead(): void {
  const notifications = [
    { id: 'a', read: false },
    { id: 'b', read: true },
  ];
  const rs: ReadState = {};
  assert.equal(countUnreadWithReadState(notifications, rs), 1);
}

function testCountUnreadEmptyList(): void {
  assert.equal(countUnreadWithReadState([], {}), 0);
}

// ── Multi-tab merge scenario ───────────────────────────────────────────────

function testMultiTabMerge(): void {
  // Tab A reads n1 at T=1000, n2 at T=2000.
  const tabA: ReadState = { n1: 1000, n2: 2000 };
  // Tab B reads n3 at T=1500.
  const tabB: ReadState = { n3: 1500 };
  // Merge — both reads must survive.
  const merged = mergeReadState(tabA, tabB);
  assert.equal(merged.n1, 1000);
  assert.equal(merged.n2, 2000);
  assert.equal(merged.n3, 1500);
}

function testIdempotentMerge(): void {
  const rs: ReadState = { n1: 1000, n2: 2000 };
  const merged = mergeReadState(rs, rs);
  assert.deepEqual(merged, rs);
}

// ── Run all tests ──────────────────────────────────────────────────────────

testEmptyMerge();
testLocalReadsArePreserved();
testIncomingReadsAreAdopted();
testLaterTimestampWins();
testResurrectionPrevented();
testResurrectionPreventedEvenWithEmptyIncoming();
testResurrectionPreventedScenario();
testIsNotificationReadWithReadState();
testIsNotificationReadServerConfirmed();
testIsNotificationReadNeitherRead();
testIsNotificationReadReadStateOverridesServerUnread();
testCountUnreadWithReadState();
testCountUnreadAllRead();
testCountUnreadNoneRead();
testCountUnreadEmptyList();
testMultiTabMerge();
testIdempotentMerge();

console.log('notification-read-state-utils.test.ts: all assertions passed');
