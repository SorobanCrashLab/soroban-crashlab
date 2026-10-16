// node --test deploy/backup/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSnapshotName, selectRetention, snapshotName } from './retention.mjs';

const NOW = new Date('2026-10-16T03:00:00Z');
const daysAgo = (days, hour = 2) => snapshotName(new Date(Date.UTC(2026, 9, 16 - days, hour, 0, 0)));

test('snapshot names round-trip and junk is ignored', () => {
  const name = snapshotName(new Date('2026-10-16T02:30:05.123Z'));
  assert.equal(name, '20261016T023005Z');
  assert.equal(parseSnapshotName(`${name}/`).toISOString(), '2026-10-16T02:30:05.000Z');
  assert.equal(parseSnapshotName('latest'), null);
  assert.deepEqual(selectRetention(['latest', 'notes.txt'], NOW), { keep: [], remove: [] });
});

test('keeps every snapshot for 7 days', () => {
  const names = Array.from({ length: 7 }, (_, i) => daysAgo(i));
  assert.deepEqual(selectRetention(names, NOW).remove, []);
});

test('keeps the newest per week to 30 days and per month to 90 days', () => {
  const names = Array.from({ length: 120 }, (_, i) => daysAgo(i));
  const { keep, remove } = selectRetention(names, NOW);

  assert.equal(keep.length + remove.length, 120);
  // Daily tier.
  for (let i = 0; i < 7; i += 1) assert.ok(keep.includes(daysAgo(i)));
  // Weekly tier: at most one per ISO week between 7 and 30 days.
  const weekly = keep.filter((n) => (NOW - parseSnapshotName(n)) / 86_400_000 >= 7 && (NOW - parseSnapshotName(n)) / 86_400_000 < 30);
  assert.ok(weekly.length >= 3 && weekly.length <= 4, `weekly kept ${weekly.length}`);
  // Monthly tier: at most one per calendar month between 30 and 90 days.
  const monthly = keep.filter((n) => (NOW - parseSnapshotName(n)) / 86_400_000 >= 30);
  assert.ok(monthly.length >= 2 && monthly.length <= 3, `monthly kept ${monthly.length}`);
  // Nothing at or beyond 90 days.
  assert.ok(remove.includes(daysAgo(90)) && remove.includes(daysAgo(119)));
  assert.ok(!keep.some((n) => (NOW - parseSnapshotName(n)) / 86_400_000 >= 90));
});

test('is deterministic regardless of input order', () => {
  const names = Array.from({ length: 60 }, (_, i) => daysAgo(i));
  assert.deepEqual(selectRetention([...names].reverse(), NOW), selectRetention(names, NOW));
});
