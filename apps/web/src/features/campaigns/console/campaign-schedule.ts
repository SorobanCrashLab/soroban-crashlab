/**
 * Flexible scheduling for campaign management (#2258): interval and cron
 * expressions, IANA timezones, one-off blackout windows and next-run previews.
 * All functions are pure and use an injected `now` for deterministic tests.
 */

export type ScheduleKind = 'interval' | 'cron' | 'once';

export interface ScheduleConfig {
  kind: ScheduleKind;
  expression: string;
  timezone: string;
  blackoutWindows: readonly { start: string; end: string }[];
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  kind: 'interval',
  expression: '60m',
  timezone: 'UTC',
  blackoutWindows: [],
};

export class ScheduleExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleExpressionError';
  }
}

const INTERVAL_PATTERN = /^(\d+)(m|h|d)$/;
const CRON_FIELDS = 5;

export function parseInterval(expression: string): number | null {
  const match = INTERVAL_PATTERN.exec(expression.trim().toLowerCase());
  if (!match) return null;
  const value = Number(match[1]);
  const multiplier = match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000;
  const ms = value * multiplier;
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export interface CronFields {
  minute: readonly number[];
  hour: readonly number[];
  dayOfMonth: readonly number[];
  month: readonly number[];
  dayOfWeek: readonly number[];
}

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const range = /^(\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!range) throw new ScheduleExpressionError(`Invalid cron field: ${field}`);
    const start = Number(range[1]);
    const end = range[2] === undefined ? start : Number(range[2]);
    const step = range[3] === undefined ? 1 : Number(range[3]);
    if (start < min || start > max || end < min || end > max || step < 1) {
      throw new ScheduleExpressionError(`Cron field out of range: ${field}`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_FIELDS) {
    throw new ScheduleExpressionError(`Cron expression must have ${CRON_FIELDS} fields.`);
  }
  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dayOfMonth: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12),
    dayOfWeek: parseCronField(fields[4], 0, 6),
  };
}

export function validateSchedule(schedule: ScheduleConfig): string | null {
  if (schedule.kind === 'interval' && parseInterval(schedule.expression) === null) {
    return 'Interval must look like 30m, 2h or 1d.';
  }
  if (schedule.kind === 'cron') {
    try { parseCron(schedule.expression); } catch (error) {
      return error instanceof Error ? error.message : 'Invalid cron expression.';
    }
  }
  if (schedule.kind === 'once' && Number.isNaN(Date.parse(schedule.expression))) {
    return 'One-off schedules require an ISO-8601 timestamp.';
  }
  if (!isValidTimezone(schedule.timezone)) return 'Unknown IANA timezone.';
  for (const window of schedule.blackoutWindows) {
    const start = Date.parse(window.start);
    const end = Date.parse(window.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return 'Blackout windows need a valid start before end.';
    }
  }
  return null;
}

export function isValidTimezone(timezone: string): boolean {
  if (!timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** True when the instant falls inside any blackout window (inclusive start). */
export function isBlackout(schedule: ScheduleConfig, nowMs: number): boolean {
  return schedule.blackoutWindows.some((window) => {
    const start = Date.parse(window.start);
    const end = Date.parse(window.end);
    return nowMs >= start && nowMs < end;
  });
}

function utcParts(date: Date): { minute: number; hour: number; day: number; month: number; weekday: number } {
  return {
    minute: date.getUTCMinutes(),
    hour: date.getUTCHours(),
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    weekday: date.getUTCDay(),
  };
}

export function cronMatches(fields: CronFields, date: Date): boolean {
  const parts = utcParts(date);
  return fields.minute.includes(parts.minute)
    && fields.hour.includes(parts.hour)
    && fields.dayOfMonth.includes(parts.day)
    && fields.month.includes(parts.month)
    && fields.dayOfWeek.includes(parts.weekday);
}

/**
 * Compute the next eligible run after `nowMs`. Scans minute by minute up to
 * `limitMs` (default 366 days) and skips blackout windows. Returns null when no
 * slot exists in the horizon, so callers can surface a scheduling warning.
 */
export function nextRunAfter(schedule: ScheduleConfig, nowMs: number, limitMs = 366 * 86_400_000): number | null {
  const validationError = validateSchedule(schedule);
  if (validationError) throw new ScheduleExpressionError(validationError);

  if (schedule.kind === 'once') {
    const target = Date.parse(schedule.expression);
    return target > nowMs && !isBlackout(schedule, target) ? target : null;
  }

  if (schedule.kind === 'interval') {
    const interval = parseInterval(schedule.expression);
    if (interval === null) return null;
    let candidate = nowMs + interval;
    while (candidate <= nowMs + limitMs) {
      if (!isBlackout(schedule, candidate)) return candidate;
      candidate += interval;
    }
    return null;
  }

  const fields = parseCron(schedule.expression);
  let candidate = Math.floor(nowMs / 60_000) * 60_000 + 60_000;
  const deadline = nowMs + limitMs;
  while (candidate <= deadline) {
    if (cronMatches(fields, new Date(candidate)) && !isBlackout(schedule, candidate)) return candidate;
    candidate += 60_000;
  }
  return null;
}

/** Human-readable summary for the campaign list and detail header. */
export function describeSchedule(schedule: ScheduleConfig): string {
  if (schedule.kind === 'interval') {
    const interval = parseInterval(schedule.expression);
    return interval === null ? 'Invalid interval' : `Every ${schedule.expression} (${schedule.timezone})`;
  }
  if (schedule.kind === 'once') return `Once at ${schedule.expression} (${schedule.timezone})`;
  return `Cron ${schedule.expression} (${schedule.timezone})`;
}
