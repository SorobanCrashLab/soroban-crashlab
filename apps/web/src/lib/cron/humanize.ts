/**
 * Turns a parsed cron expression into a short human-readable phrase (#1422),
 * e.g. "every 30 minutes", "every day at 09:00 UTC",
 * "at 09:00 UTC on Monday and Thursday".
 *
 * Times are always described in UTC to match the next-run calculator.
 */

import { parseCron, type CronExpression, CronParseError } from './parser';

const DOW_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function coversRange(values: number[], min: number, max: number): boolean {
  return values.length === max - min + 1;
}

/** Returns the step `n` when `values` is exactly `min, min+n, …` up to `max`, else null. */
function detectStep(values: number[], min: number, max: number): number | null {
  if (values.length < 2 || values[0] !== min) return null;
  const step = values[1] - values[0];
  if (step < 2) return null;
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] !== step) return null;
  }
  // The enumeration must genuinely stop because the range ran out, not because
  // the author listed an arbitrary subset.
  if (values[values.length - 1] + step <= max) return null;
  return step;
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function dayClause(expr: CronExpression): string {
  const domR = expr.dayOfMonthRestricted;
  const dowR = expr.dayOfWeekRestricted;
  if (!domR && !dowR) return '';

  const parts: string[] = [];
  if (domR) {
    parts.push(`on day ${joinList(expr.dayOfMonth.map(String))} of the month`);
  }
  if (dowR) {
    parts.push(`on ${joinList(expr.dayOfWeek.map((d) => DOW_NAMES[d]))}`);
  }
  return ` ${parts.join(' or ')}`;
}

function monthClause(expr: CronExpression): string {
  if (coversRange(expr.month, 1, 12)) return '';
  return ` in ${joinList(expr.month.map((m) => MONTH_NAMES[m - 1]))}`;
}

/** Humanizes an already-parsed expression. */
export function humanizeCronExpression(expr: CronExpression): string {
  const { minute, hour } = expr;
  const minuteEvery = coversRange(minute, 0, 59);
  const hourEvery = coversRange(hour, 0, 23);
  const everyDay = !expr.dayOfMonthRestricted && !expr.dayOfWeekRestricted;
  const everyMonth = coversRange(expr.month, 1, 12);
  const unrestrictedDate = everyDay && everyMonth;

  const minuteStep = detectStep(minute, 0, 59);
  if (minuteStep && hourEvery && unrestrictedDate) {
    return `every ${minuteStep} minutes`;
  }
  if (minuteEvery && hourEvery && unrestrictedDate) {
    return 'every minute';
  }

  const hourStep = detectStep(hour, 0, 23);
  if (minute.length === 1 && hourStep && unrestrictedDate) {
    const at = minute[0] === 0 ? '' : ` at minute ${minute[0]}`;
    return `every ${hourStep} hours${at}`;
  }

  if (minute.length === 1 && hourEvery && unrestrictedDate) {
    return minute[0] === 0 ? 'every hour' : `every hour at minute ${minute[0]}`;
  }

  if (minute.length === 1 && hour.length === 1) {
    const time = `${pad(hour[0])}:${pad(minute[0])} UTC`;
    if (unrestrictedDate) return `every day at ${time}`;
    return `at ${time}${dayClause(expr)}${monthClause(expr)}`;
  }

  // Generic fallback for irregular multi-value fields.
  const minuteText = minuteEvery
    ? 'every minute'
    : `at minute ${joinList(minute.map(String))}`;
  const hourText = hourEvery ? 'every hour' : `hour ${joinList(hour.map(String))}`;
  return `${minuteText} past ${hourText}${dayClause(expr)}${monthClause(expr)}`;
}

/**
 * Parses and humanizes `source`. Returns a `"Invalid: …"` string rather than
 * throwing, so it is safe to call directly from a live-preview input handler.
 */
export function humanizeCron(source: string): string {
  try {
    return humanizeCronExpression(parseCron(source));
  } catch (error) {
    const detail = error instanceof CronParseError ? error.message : 'not a valid cron expression.';
    return `Invalid: ${detail}`;
  }
}
