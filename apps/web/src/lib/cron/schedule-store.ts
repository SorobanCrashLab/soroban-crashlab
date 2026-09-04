/**
 * Pure CRUD helpers and types for scheduled recurring campaigns (#1422).
 *
 * The functions here never touch I/O — they take the current list and return a
 * new list. Persistence lives in the API route store; the mock interval worker
 * feeds the results back through `evaluateTick` (see ./tick-evaluator).
 */

import { CronParseError, cronErrorMessage, parseCron } from './parser';
import { humanizeCronExpression } from './humanize';
import { nextRun } from './next-run';

export interface Schedule {
  id: string;
  name: string;
  /** 5-field cron expression, interpreted in UTC. */
  cron: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * ISO timestamp of the most recent cron tick that produced a run, or null
   * when the schedule has never fired. This is the anchor the tick evaluator
   * advances from, which is what makes evaluation idempotent.
   */
  lastRunAt: string | null;
}

/** Tag applied to every run the scheduler produces, surfaced in the runs list. */
export const SCHEDULED_RUN_TAG = 'scheduled';

export interface ScheduledRun {
  id: string;
  scheduleId: string;
  scheduleName: string;
  cron: string;
  /** The cron tick this run satisfies (ISO, minute-aligned UTC). */
  scheduledFor: string;
  /** Wall-clock time the worker recorded the run (ISO). */
  executedAt: string;
  status: 'scheduled';
  /** How many due ticks this single run represents (>1 ⇒ missed ticks collapsed). */
  tickCount: number;
  /** True when this run is one catch-up covering multiple missed ticks. */
  caughtUp: boolean;
  tags: string[];
}

export interface ScheduleInput {
  name: string;
  cron: string;
  enabled?: boolean;
}

export const MAX_SCHEDULE_NAME_LENGTH = 80;

export function validateScheduleName(
  name: string,
  existing: readonly Schedule[],
  selfId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Schedule name cannot be empty.';
  if (trimmed.length > MAX_SCHEDULE_NAME_LENGTH) {
    return `Schedule name cannot exceed ${MAX_SCHEDULE_NAME_LENGTH} characters.`;
  }
  if (
    existing.some(
      (s) => s.id !== selfId && s.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return 'A schedule with that name already exists.';
  }
  return null;
}

/** Returns a cron-parse error message, or null when the expression is valid. */
export function validateCron(expression: string): string | null {
  return cronErrorMessage(expression);
}

export function createSchedule(input: ScheduleInput, now: string, id: string): Schedule {
  const cronError = validateCron(input.cron);
  if (cronError) throw new CronParseError(cronError);
  return {
    id,
    name: input.name.trim(),
    cron: input.cron.trim(),
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
  };
}

export function addSchedule(list: readonly Schedule[], schedule: Schedule): Schedule[] {
  return [...list, schedule];
}

export type SchedulePatch = Partial<Pick<Schedule, 'name' | 'cron' | 'enabled'>>;

export function updateSchedule(
  list: readonly Schedule[],
  id: string,
  patch: SchedulePatch,
  now: string,
): Schedule[] {
  return list.map((schedule) => {
    if (schedule.id !== id) return schedule;
    const next: Schedule = { ...schedule };
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.cron !== undefined) {
      const cronError = validateCron(patch.cron);
      if (cronError) throw new CronParseError(cronError);
      next.cron = patch.cron.trim();
      // A changed expression invalidates the old firing anchor.
      if (next.cron !== schedule.cron) next.lastRunAt = null;
    }
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    next.updatedAt = now;
    return next;
  });
}

export function deleteSchedule(list: readonly Schedule[], id: string): Schedule[] {
  return list.filter((schedule) => schedule.id !== id);
}

export function setScheduleEnabled(
  list: readonly Schedule[],
  id: string,
  enabled: boolean,
  now: string,
): Schedule[] {
  return updateSchedule(list, id, { enabled }, now);
}

/** Humanized preview for a schedule's expression ("every 30 minutes", …). */
export function describeSchedule(schedule: Schedule): string {
  try {
    return humanizeCronExpression(parseCron(schedule.cron));
  } catch {
    return 'Invalid cron expression';
  }
}

/** Next fire time for a schedule after `after`, or null when unsatisfiable/invalid. */
export function nextRunForSchedule(schedule: Schedule, after: Date): Date | null {
  try {
    return nextRun(parseCron(schedule.cron), after);
  } catch {
    return null;
  }
}
