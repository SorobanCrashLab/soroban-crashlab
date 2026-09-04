import type { Schedule, ScheduledRun } from '@/lib/cron';

/**
 * In-process store for scheduled recurring campaigns (#1422).
 *
 * Mirrors the other mock API stores (see api/networks/_store): a module-scoped
 * singleton the Next.js server process holds for the session. Not durable — the
 * point is an observable end-to-end loop in mock mode, not persistence.
 */

export interface SchedulerState {
  schedules: Schedule[];
  history: ScheduledRun[];
}

function seed(): SchedulerState {
  const createdAt = '2026-03-01T00:00:00.000Z';
  return {
    schedules: [
      {
        id: 'sched-nightly-auth',
        name: 'Nightly auth invariant sweep',
        cron: '0 3 * * *',
        enabled: true,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
      },
      {
        id: 'sched-hourly-smoke',
        name: 'Hourly smoke campaign',
        cron: '0 * * * *',
        enabled: true,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
      },
      {
        id: 'sched-weekly-deep',
        name: 'Weekly deep fuzz (Mondays)',
        cron: '30 2 * * 1',
        enabled: false,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
      },
    ],
    history: [],
  };
}

let _state: SchedulerState | null = null;

export function getSchedulerState(): SchedulerState {
  if (!_state) _state = seed();
  return _state;
}

export function setSchedulerState(next: SchedulerState): SchedulerState {
  _state = next;
  return _state;
}

/** Test hook — restores the seed data. */
export function resetSchedulerState(): void {
  _state = null;
}
