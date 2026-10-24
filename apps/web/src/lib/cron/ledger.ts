/**
 * Durable scheduler helpers (#1422): misfire recovery and the execution
 * ledger.
 *
 * `evaluateTick` already collapses every missed slot into a single catch-up
 * run. This module applies the schedule-level `skip` misfire policy first, so
 * a schedule that opted out of catch-up can advance its anchor past the missed
 * slots instead of firing again.
 */

import { nextRun } from './next-run';
import { parseCron } from './parser';
import {
  type MisfirePolicy,
  type Schedule,
  type ScheduledRun,
} from './schedule-store';

/** One completed/deferred/skipped scheduler execution. */
export interface ExecutionLedgerEntry {
  scheduleId: string;
  scheduleName: string;
  /** Cron slot the execution was meant to satisfy (ISO). */
  plannedAt: string;
  runId: string;
  outcome: 'success' | 'failed' | 'skipped_overlap' | 'misfire';
  startedAt?: string;
  finishedAt?: string;
}

/** A schedule whose missed slots were discarded by its `skip` policy. */
export interface MisfireRecord {
  scheduleId: string;
  missed: number;
  policy: MisfirePolicy;
}

export interface MisfireRecoveryInput {
  schedules: readonly Schedule[];
  history: readonly ScheduledRun[];
  now: Date;
  /** Scheduling windows; currently informational for recovery. */
  windows?: unknown;
}

export interface MisfireRecovery {
  schedules: Schedule[];
  history: ScheduledRun[];
  misfires: MisfireRecord[];
}

const MAX_MISFIRE_SCAN_TICKS = 100_000;

/**
 * Applies each schedule's misfire policy. Schedules that opted into
 * `run-immediately` are left untouched: `evaluateTick` will produce one
 * catch-up run for them. Schedules with `skip` advance their anchor to the
 * last missed slot so those slots are not fired.
 */
export function applyMisfirePolicies(input: MisfireRecoveryInput): MisfireRecovery {
  const misfires: MisfireRecord[] = [];

  const schedules = input.schedules.map((schedule) => {
    if (!schedule.enabled) return schedule;
    if ((schedule.policy?.misfire ?? 'run-immediately') !== 'skip') return schedule;

    let expr;
    try {
      expr = parseCron(schedule.cron);
    } catch {
      return schedule;
    }

    const anchor = new Date(schedule.lastRunAt ?? schedule.createdAt);
    if (Number.isNaN(anchor.getTime())) return schedule;

    let cursor = anchor;
    let missed = 0;
    let lastMissed: Date | null = null;
    for (let i = 0; i < MAX_MISFIRE_SCAN_TICKS; i += 1) {
      let tick: Date;
      try {
        tick = nextRun(expr, cursor);
      } catch {
        break;
      }
      if (tick.getTime() > input.now.getTime()) break;
      missed += 1;
      lastMissed = tick;
      cursor = tick;
    }

    if (!lastMissed) return schedule;

    misfires.push({ scheduleId: schedule.id, missed, policy: 'skip' });
    return { ...schedule, lastRunAt: lastMissed.toISOString() };
  });

  return { schedules, history: [...input.history], misfires };
}

export type ExecutionLedger = Record<string, ExecutionLedgerEntry[]>;

export interface RecordExecutionLedgerEntryInput {
  scheduleId: string;
  scheduleName: string;
  plannedFor: string;
  runId: string;
  outcome: ExecutionLedgerEntry['outcome'];
  startedAt: string;
  finishedAt: string;
}

/**
 * Returns a new ledger with one entry appended to the schedule's history.
 * Append-only per schedule: existing entries are never rewritten.
 */
export function recordExecutionLedgerEntry(
  ledger: ExecutionLedger,
  input: RecordExecutionLedgerEntryInput,
): ExecutionLedger {
  const entry: ExecutionLedgerEntry = {
    scheduleId: input.scheduleId,
    scheduleName: input.scheduleName,
    plannedAt: input.plannedFor,
    runId: input.runId,
    outcome: input.outcome,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };

  return {
    ...ledger,
    [input.scheduleId]: [...(ledger[input.scheduleId] ?? []), entry],
  };
}
