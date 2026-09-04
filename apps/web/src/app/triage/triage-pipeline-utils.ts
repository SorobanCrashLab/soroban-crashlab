import type { FuzzingRun, RunStatus } from '../types';
import { TriageColumn } from './triage-board-utils';

export interface TriageMove {
  runId: string;
  targetColumn: TriageColumn;
  targetStatus: RunStatus;
}

export interface MoveOp {
  opId: number;
  move: TriageMove;
  previousStatus: RunStatus;
}

export type PersistTransport = (move: TriageMove) => Promise<boolean>;

let transportOverride: PersistTransport | null = null;

/**
 * Injectable transport override for testing persistence failure and concurrency simulation.
 */
export function setPersistTransportOverride(transport: PersistTransport | null): void {
  transportOverride = transport;
}

/**
 * Map TriageColumn to corresponding backend RunStatus.
 */
export function columnToStatus(column: TriageColumn): RunStatus {
  switch (column) {
    case 'failed':
      return 'failed';
    case 'active':
      return 'running';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

/**
 * Pure helper to apply a move operation optimistically to a runs collection.
 */
export function applyMove(runs: FuzzingRun[], move: TriageMove): FuzzingRun[] {
  return runs.map((run) => {
    if (run.id === move.runId) {
      return { ...run, status: move.targetStatus };
    }
    return run;
  });
}

/**
 * Pure helper to revert a move operation on a runs collection.
 */
export function revertMove(runs: FuzzingRun[], runId: string, previousStatus: RunStatus): FuzzingRun[] {
  return runs.map((run) => {
    if (run.id === runId) {
      return { ...run, status: previousStatus };
    }
    return run;
  });
}

/**
 * Persist move asynchronously to the backend API or mock transport.
 */
export async function persistMove(move: TriageMove): Promise<boolean> {
  if (transportOverride) {
    return transportOverride(move);
  }

  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(move.runId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: move.targetStatus }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ToastNotification {
  message: string;
  variant?: 'error' | 'success' | 'info' | 'warning';
}

/**
 * Sequential Optimistic Pipeline Queue.
 * Serializes successive move mutations to avoid lost-update interleaving.
 * Applies changes optimistically, and rolls back the affected item with a toast notice upon failure.
 */
export class OptimisticMovePipeline {
  private nextOpId = 1;
  private queue: Promise<void> = Promise.resolve();
  private currentRuns: FuzzingRun[];
  private onStateChange: (runs: FuzzingRun[]) => void;
  private onErrorToast?: (toast: ToastNotification) => void;

  constructor(
    initialRuns: FuzzingRun[],
    onStateChange: (runs: FuzzingRun[]) => void,
    onErrorToast?: (toast: ToastNotification) => void,
  ) {
    this.currentRuns = [...initialRuns];
    this.onStateChange = onStateChange;
    this.onErrorToast = onErrorToast;
  }

  public updateRuns(runs: FuzzingRun[]): void {
    this.currentRuns = [...runs];
  }

  public getRuns(): FuzzingRun[] {
    return this.currentRuns;
  }

  /**
   * Submit an optimistic move request.
   * Immediately updates visual state and queues background persistence.
   */
  public submitMove(move: TriageMove): Promise<boolean> {
    const _opId = this.nextOpId++;
    const targetRun = this.currentRuns.find((r) => r.id === move.runId);
    const previousStatus = targetRun ? targetRun.status : move.targetStatus;

    // 1. Optimistic apply (sub-frame perceived UI commit)
    const optimisticRuns = applyMove(this.currentRuns, move);
    this.currentRuns = optimisticRuns;
    this.onStateChange(optimisticRuns);

    // 2. Queue sequential persistence task
    let moveSuccess = false;

    this.queue = this.queue.then(async () => {
      try {
        const success = await persistMove(move);
        if (success) {
          moveSuccess = true;
          // Success path remains silent (no toast spam)
        } else {
          // Failure path: revert affected item to previousStatus
          this.currentRuns = revertMove(this.currentRuns, move.runId, previousStatus);
          this.onStateChange(this.currentRuns);
          if (this.onErrorToast) {
            this.onErrorToast({
              message: `Failed to move run ${move.runId} to ${move.targetColumn}. Action reverted.`,
              variant: 'error',
            });
          }
        }
      } catch {
        // Exception path: revert affected item to previousStatus
        this.currentRuns = revertMove(this.currentRuns, move.runId, previousStatus);
        this.onStateChange(this.currentRuns);
        if (this.onErrorToast) {
          this.onErrorToast({
            message: `Failed to move run ${move.runId} to ${move.targetColumn}. Action reverted.`,
            variant: 'error',
          });
        }
      }
    });

    return this.queue.then(() => moveSuccess);
  }
}
