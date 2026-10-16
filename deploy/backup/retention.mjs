#!/usr/bin/env node
/**
 * Backup retention tiers (#1900): every snapshot from the last 7 days, the
 * newest per ISO week up to 30 days, the newest per month up to 90 days,
 * nothing older.
 *
 *   rclone lsf --dirs-only vault:snapshots/ | node deploy/backup/retention.mjs [--now ISO]
 *
 * Reads snapshot names (`YYYYMMDDTHHMMSSZ`, optional trailing `/`) on stdin
 * and prints the ones to delete. Names it cannot parse are never deleted.
 */

import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;
export const TIERS = Object.freeze({ dailyDays: 7, weeklyDays: 30, monthlyDays: 90 });

export function parseSnapshotName(name) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\/?$/.exec(name.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

export function snapshotName(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function isoWeek(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return `${day.getUTCFullYear()}-W${Math.ceil(((day - yearStart) / DAY_MS + 1) / 7)}`;
}

/** Returns `{ keep, remove }`, both sorted newest first. */
export function selectRetention(names, now = new Date(), tiers = TIERS) {
  const dated = names
    .map((name) => ({ name, at: parseSnapshotName(name) }))
    .filter(({ at }) => at !== null)
    .sort((a, b) => b.at - a.at);

  const keep = new Set();
  const seenWeeks = new Set();
  const seenMonths = new Set();
  for (const { name, at } of dated) {
    const ageDays = (now - at) / DAY_MS;
    if (ageDays < tiers.dailyDays) {
      keep.add(name);
    } else if (ageDays < tiers.weeklyDays) {
      const week = isoWeek(at);
      if (!seenWeeks.has(week)) keep.add(name);
      seenWeeks.add(week);
    } else if (ageDays < tiers.monthlyDays) {
      const month = at.toISOString().slice(0, 7);
      if (!seenMonths.has(month)) keep.add(name);
      seenMonths.add(month);
    }
  }

  return {
    keep: dated.filter(({ name }) => keep.has(name)).map(({ name }) => name),
    remove: dated.filter(({ name }) => !keep.has(name)).map(({ name }) => name),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const index = process.argv.indexOf('--now');
  const now = index >= 0 ? new Date(process.argv[index + 1]) : new Date();
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const { remove } = selectRetention(input.split('\n').filter(Boolean), now);
    if (remove.length) console.log(remove.join('\n'));
  });
}
