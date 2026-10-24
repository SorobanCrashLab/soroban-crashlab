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
import type { CampaignClass } from '../capacity/quotas';

/** Class a schedule fires as when it does not name one (#1904). */
export const DEFAULT_SCHEDULE_CLASS: CampaignClass = 'nightly';

/** What to do with cron slots missed while the scheduler was down. */
export type MisfirePolicy = 'skip' | 'run-immediately';
/** What to do when a slot comes due while the previous run is still active. */
export type OverlapPolicy = 'skip' | 'allow' | 'queue';

export interface CronPolicy {
  misfire: MisfirePolicy;
  /** Maximum number of missed slots collapsed into a catch-up run. */
  catchUpCap: number;
  overlap: OverlapPolicy;
}

export const DEFAULT_MISFIRE_POLICY: MisfirePolicy = 'run-immediately';
export const DEFAULT_OVERLAP_POLICY: OverlapPolicy = 'skip';
export const DEFAULT_CATCH_UP_CAP = 3;

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
  /**
   * Capacity class of the campaigns this schedule fires (#1904); decides its
   * scheduling window and priority. Absent means {@link DEFAULT_SCHEDULE_CLASS}.
   */
  campaignClass?: CampaignClass;
  /** Misfire/overlap behaviour for this schedule. */
  policy?: CronPolicy;
  /** Cached next fire time (ISO), when known. */
  nextRun?: string | null;
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
  /**
   * Deterministic Idempotency-Key (schedule id + slot) for the campaign this
   * run fires (#1634): a cron retry of the same slot dedupes server-side.
   */
  idempotencyKey: string;
  /** Capacity class the run fired as (#1904). */
  campaignClass: CampaignClass;
}

export interface ScheduleInput {
  name: string;
  cron: string;
  enabled?: boolean;
  campaignClass?: CampaignClass;
  misfirePolicy?: MisfirePolicy;
  misfireCatchUpCap?: number;
  overlapPolicy?: OverlapPolicy;
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
    policy: {
      misfire: input.misfirePolicy ?? DEFAULT_MISFIRE_POLICY,
      catchUpCap: input.misfireCatchUpCap ?? DEFAULT_CATCH_UP_CAP,
      overlap: input.overlapPolicy ?? DEFAULT_OVERLAP_POLICY,
    },
    ...(input.campaignClass ? { campaignClass: input.campaignClass } : {}),
  };
}

export function addSchedule(list: readonly Schedule[], schedule: Schedule): Schedule[] {
  return [...list, schedule];
}

export type SchedulePatch = Partial<
  Pick<Schedule, 'name' | 'cron' | 'enabled' | 'campaignClass'>
> & {
  misfire?: MisfirePolicy;
  overlap?: OverlapPolicy;
  catchUpCap?: number;
};

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
    if (patch.campaignClass !== undefined) next.campaignClass = patch.campaignClass;
    if (
      patch.misfire !== undefined ||
      patch.overlap !== undefined ||
      patch.catchUpCap !== undefined
    ) {
      next.policy = {
        misfire: patch.misfire ?? next.policy?.misfire ?? DEFAULT_MISFIRE_POLICY,
        catchUpCap: patch.catchUpCap ?? next.policy?.catchUpCap ?? DEFAULT_CATCH_UP_CAP,
        overlap: patch.overlap ?? next.policy?.overlap ?? DEFAULT_OVERLAP_POLICY,
      };
    }
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

export type MisfirePolicyNormalization =
  | { policy: MisfirePolicy; catchUpCap: number }
  | { error: string };

/**
 * Normalizes a request-supplied misfire setting. Accepts a policy string or an
 * object carrying `policy`/`misfire` and `catchUpCap`; absent means the default.
 */
export function normalizeMisfirePolicy(raw: unknown): MisfirePolicyNormalization {
  let policy: unknown = raw;
  let catchUpCap: unknown = DEFAULT_CATCH_UP_CAP;

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    policy = record.policy ?? record.misfire;
    catchUpCap = record.catchUpCap ?? DEFAULT_CATCH_UP_CAP;
  }

  if (policy === undefined || policy === null) policy = DEFAULT_MISFIRE_POLICY;
  if (policy !== 'skip' && policy !== 'run-immediately') {
    return { error: 'misfirePolicy must be skip or run-immediately.' };
  }
  if (
    typeof catchUpCap !== 'number' ||
    !Number.isInteger(catchUpCap) ||
    catchUpCap < 0 ||
    catchUpCap > 100
  ) {
    return { error: 'misfireCatchUpCap must be an integer between 0 and 100.' };
  }

  return { policy, catchUpCap };
}

export type OverlapPolicyNormalization =
  | { policy: OverlapPolicy }
  | { error: string };

/** Normalizes a request-supplied overlap policy; absent means the default. */
export function normalizeOverlapPolicy(raw: unknown): OverlapPolicyNormalization {
  let policy: unknown = raw;

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    policy = (raw as Record<string, unknown>).policy ?? (raw as Record<string, unknown>).overlap;
  }

  if (policy === undefined || policy === null) policy = DEFAULT_OVERLAP_POLICY;
  if (policy !== 'skip' && policy !== 'allow' && policy !== 'queue') {
    return { error: 'overlapPolicy must be skip, allow or queue.' };
  }

  return { policy };
}
