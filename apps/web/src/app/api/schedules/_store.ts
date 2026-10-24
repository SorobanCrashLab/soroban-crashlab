import type {
  CronPolicy,
  ExecutionLedgerEntry,
  Schedule,
  ScheduledRun,
} from '@/lib/cron';

/**
 * In-process store for scheduled recurring campaigns (#1422).
 *
 * Mirrors the other mock API stores (see api/networks/_store): a module-scoped
 * singleton the Next.js server process holds for the session. Not durable - the
 * point is an observable end-to-end loop in mock mode, not persistence.
 *
 * Durable schedule semantics (#1422) add the execution ledger and per-schedule
 * misfire/overlap policies. The ledger is append-only and transitions are
 * lease-guarded so two scheduler instances cannot double-execute a window.
 */

export interface ScheduleLease {
  scheduleId: string;
  owner: string;
  expiresAt: string;
}

export interface SchedulerState {
  schedules: Schedule[];
  history: ScheduledRun[];
  /** Execution ledger keyed by schedule id. */
  ledger: Record<string, ExecutionLedgerEntry[]>;
  /** Currently-held leases by schedule id (W5-E03). */
  leases: Record<string, ScheduleLease>;
  /** Monotonic counter for run ids. */
  sequence: number;
}

const createdAt = '2026-03-01T00:00:00.000Z';

const DEFAULT_POLICY: CronPolicy = {
  misfire: 'run-immediately',
  catchUpCap: 3,
  overlap: 'skip',
};

function seed(): SchedulerState {
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
        policy: { ...DEFAULT_POLICY },
      },
      {
        id: 'sched-hourly-smoke',
        name: 'Hourly smoke campaign',
        cron: '0 * * * *',
        enabled: true,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
        policy: { ...DEFAULT_POLICY, overlap: 'queue' },
      },
      {
        id: 'sched-weekly-deep',
        name: 'Weekly deep fuzz (Mondays)',
        cron: '30 2 * * 1',
        enabled: false,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
        policy: { ...DEFAULT_POLICY, misfire: 'skip' },
      },
    ],
    history: [],
    ledger: {},
    leases: {},
    sequence: 0,
  };
}

let _state: SchedulerState | null = null;

export function getSchedulerState(): SchedulerState {
  if (!_state) _state = seed();
  return _state;
}

/** Execution ledger for one schedule; empty when it has never fired. */
export function getSchedulerLedger(scheduleId: string): ExecutionLedgerEntry[] {
  return getSchedulerState().ledger[scheduleId] ?? [];
}

export function setSchedulerState(next: SchedulerState): SchedulerState {
  _state = next;
  return _state;
}

/** Test hook - restores the seed data. */
export function resetSchedulerState(): void {
  _state = null;
}
