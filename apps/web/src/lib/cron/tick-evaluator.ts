/**
 * Tick evaluator for scheduled recurring campaigns (#1422).
 *
 * `evaluateTick` is a pure function: given the current schedules, the run
 * history, and "now", it returns the updated schedules plus any newly created
 * scheduled-run history entries. An interval worker (mock mode) calls it on a
 * timer; tests call it with a simulated clock.
 *
 * Guarantees:
 *  - Idempotent: calling it twice with the same `now` never double-records a
 *    run. The schedule's `lastRunAt` anchor advances to the last fired tick,
 *    and a history-membership check backs that up.
 *  - Missed-tick collapse: if a schedule was due to fire N times since it last
 *    ran (worker was down, long gap), a single catch-up run is recorded with
 *    `tickCount = N` and `caughtUp = true` — not N separate runs.
 */

import { parseCron } from './parser';
import { nextRun } from './next-run';
import { SCHEDULED_RUN_TAG, type Schedule, type ScheduledRun } from './schedule-store';

export interface TickInput {
  schedules: readonly Schedule[];
  history: readonly ScheduledRun[];
  now: Date;
  /** Safety cap on due ticks inspected per schedule per evaluation. */
  maxCatchUpTicks?: number;
}

export interface TickOutcome {
  schedules: Schedule[];
  history: ScheduledRun[];
  /** Runs created by this evaluation (empty when nothing was due). */
  created: ScheduledRun[];
}

const DEFAULT_MAX_CATCHUP_TICKS = 100_000;

function floorToMinute(date: Date): number {
  return Math.floor(date.getTime() / 60_000) * 60_000;
}

export function evaluateTick(input: TickInput): TickOutcome {
  const nowMs = floorToMinute(input.now);
  const maxTicks = input.maxCatchUpTicks ?? DEFAULT_MAX_CATCHUP_TICKS;
  const created: ScheduledRun[] = [];

  const schedules = input.schedules.map((schedule) => {
    if (!schedule.enabled) return schedule;

    let expr;
    try {
      expr = parseCron(schedule.cron);
    } catch {
      return schedule; // invalid expressions never fire
    }

    const anchorIso = schedule.lastRunAt ?? schedule.createdAt;
    const anchor = new Date(anchorIso);
    if (Number.isNaN(anchor.getTime())) return schedule;

    // Walk every tick strictly after the anchor and at or before now.
    const dueTicks: Date[] = [];
    let cursor = anchor;
    for (let i = 0; i < maxTicks; i++) {
      let tick: Date;
      try {
        tick = nextRun(expr, cursor);
      } catch {
        break; // expression became unsatisfiable
      }
      if (tick.getTime() > nowMs) break;
      dueTicks.push(tick);
      cursor = tick;
    }

    if (dueTicks.length === 0) return schedule;

    const lastTick = dueTicks[dueTicks.length - 1];
    const lastTickIso = lastTick.toISOString();

    const alreadyRecorded = input.history.some(
      (run) => run.scheduleId === schedule.id && run.scheduledFor === lastTickIso,
    );

    if (!alreadyRecorded) {
      created.push({
        id: `srun-${schedule.id}-${lastTick.getTime()}`,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        cron: schedule.cron,
        scheduledFor: lastTickIso,
        executedAt: input.now.toISOString(),
        status: 'scheduled',
        tickCount: dueTicks.length,
        caughtUp: dueTicks.length > 1,
        tags: [SCHEDULED_RUN_TAG],
      });
    }

    return { ...schedule, lastRunAt: lastTickIso };
  });

  return {
    schedules,
    history: [...input.history, ...created],
    created,
  };
}
