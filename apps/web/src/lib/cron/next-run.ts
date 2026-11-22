/**
 * Next-run calculator for a parsed cron expression (#1422).
 *
 * All arithmetic is done with the UTC `Date` accessors, so results are stable
 * regardless of the host machine's timezone and never land on a skipped or
 * repeated wall-clock hour. Documented v1 limitation: there is no DST /
 * wall-clock semantics — every field is interpreted in UTC.
 *
 * Day matching follows standard cron: when BOTH day-of-month and day-of-week
 * are restricted (neither is `*`), a day matches if EITHER field matches. When
 * only one is restricted, only that field must match.
 */

import type { CronExpression } from './parser';

// The loop advances by month/day/hour/minute jumps, not raw minutes, so a few
// hundred iterations covers any satisfiable expression (the worst realistic
// case, `0 0 29 2 *`, resolves in well under 300). The ceiling — roughly a
// 300-year horizon at ~30 iterations/year — only exists to turn an
// unsatisfiable expression (e.g. `0 0 30 2 *`) into a throw instead of a hang.
const MAX_ITERATIONS = 10_000;

function dayMatches(expr: CronExpression, date: Date): boolean {
  const dom = date.getUTCDate();
  const dow = date.getUTCDay();

  if (expr.dayOfMonthRestricted && expr.dayOfWeekRestricted) {
    return expr.dayOfMonth.includes(dom) || expr.dayOfWeek.includes(dow);
  }
  if (expr.dayOfMonthRestricted) {
    return expr.dayOfMonth.includes(dom);
  }
  if (expr.dayOfWeekRestricted) {
    return expr.dayOfWeek.includes(dow);
  }
  return true;
}

/**
 * Returns the first instant strictly after `after` that satisfies `expr`,
 * aligned to the start of a minute (seconds and milliseconds zeroed).
 *
 * @throws {RangeError} when no matching instant exists within the search horizon
 *   (an unsatisfiable expression such as `0 0 30 2 *`).
 */
export function nextRun(expr: CronExpression, after: Date): Date {
  // Start from the next whole minute strictly after `after`.
  const cursor = new Date(
    Date.UTC(
      after.getUTCFullYear(),
      after.getUTCMonth(),
      after.getUTCDate(),
      after.getUTCHours(),
      after.getUTCMinutes() + 1,
      0,
      0,
    ),
  );

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (!expr.month.includes(cursor.getUTCMonth() + 1)) {
      // Jump to 00:00 on the first day of the next month.
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(expr, cursor)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!expr.hour.includes(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!expr.minute.includes(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return new Date(cursor.getTime());
  }

  throw new RangeError(
    `Cron expression "${expr.source}" has no matching run within the search horizon.`,
  );
}

/**
 * Returns up to `limit` successive run times after `after`, oldest first.
 * Stops early if the expression becomes unsatisfiable.
 */
export function nextRuns(expr: CronExpression, after: Date, limit: number): Date[] {
  const out: Date[] = [];
  let cursor = after;
  for (let i = 0; i < limit; i++) {
    try {
      cursor = nextRun(expr, cursor);
    } catch {
      break;
    }
    out.push(cursor);
  }
  return out;
}
