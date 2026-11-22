/**
 * lib/replay/job-state — the progress record for a replay request (#1876).
 *
 * A replay is not a single request: it resolves a bundle, starts a runner,
 * waits, then verifies the signature. The UI needs to show that walk, and the
 * result page needs to survive a reload. This module defines the job shape and
 * the pure transitions over it; persistence lives in `job-store.ts`.
 *
 * Events carry a monotonically increasing sequence number and a non-decreasing
 * percentage, which is what makes an SSE client reconnect-safe: it can ask for
 * "everything after seq N" and render a bar that never jumps backwards.
 */

import type { ReplayEnvironment, EnvironmentCheck } from './environment';
import type { ReplayFailure } from './failure';
import type { ReplayRunner } from './runners';
import type { ReplayResult } from './result';

export const REPLAY_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'mismatch',
  'failed',
  'cancelled',
] as const;

export type ReplayJobStatus = (typeof REPLAY_JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: readonly ReplayJobStatus[] = [
  'succeeded',
  'mismatch',
  'failed',
  'cancelled',
];

export function isTerminalJobStatus(status: ReplayJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export type ReplayJobPhase = 'queued' | 'bundle' | 'runner' | 'verify' | 'done';

export interface ReplayJobEvent {
  /** 1-based, strictly increasing within a job. */
  seq: number;
  at: string;
  phase: ReplayJobPhase;
  message: string;
  /** 0–100, never decreases between events. */
  percent: number;
  level: 'info' | 'warn' | 'error';
}

export interface ReplayJob {
  id: string;
  sourceRunId: string;
  runner: ReplayRunner;
  status: ReplayJobStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  /** The caller's environment, when supplied. */
  environment?: ReplayEnvironment;
  /** The comparison performed before the job started. */
  environmentCheck?: EnvironmentCheck;
  events: ReplayJobEvent[];
  /** Present once the runner has produced diagnostics. */
  result?: ReplayResult;
  failure?: ReplayFailure;
}

export const JOB_TRANSITIONS: Record<ReplayJobStatus, readonly ReplayJobStatus[]> = {
  queued: ['running', 'failed', 'cancelled'],
  running: ['succeeded', 'mismatch', 'failed', 'cancelled'],
  succeeded: [],
  mismatch: [],
  failed: [],
  cancelled: [],
};

/**
 * A self-transition is allowed and is a no-op, so an idempotent retry of the
 * same request does not error. Terminal jobs can never move again.
 */
export function canTransitionJob(from: ReplayJobStatus, to: ReplayJobStatus): boolean {
  if (from === to) return TERMINAL_JOB_STATUSES.includes(from) ? false : true;
  return JOB_TRANSITIONS[from].includes(to);
}

export interface JobTransitionResult {
  ok: boolean;
  job: ReplayJob;
  message?: string;
}

/**
 * Pure status change. `patch` lets the caller attach the failure/result in the
 * same step; the timestamp and the terminal invariant are applied here.
 */
export function transitionJob(
  job: ReplayJob,
  to: ReplayJobStatus,
  patch: { failure?: ReplayFailure; result?: ReplayJob['result']; at?: string } = {},
): JobTransitionResult {
  if (!canTransitionJob(job.status, to)) {
    return {
      ok: false,
      job,
      message: `Cannot move replay job ${job.id} from ${job.status} to ${to}.`,
    };
  }

  const at = patch.at ?? new Date().toISOString();
  return {
    ok: true,
    job: {
      ...job,
      status: to,
      updatedAt: at,
      ...(patch.failure !== undefined ? { failure: patch.failure } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
    },
  };
}

export interface JobEventInput {
  phase: ReplayJobPhase;
  message: string;
  percent: number;
  level?: ReplayJobEvent['level'];
  at?: string;
}

export const MAX_JOB_EVENTS = 200;

/**
 * Appends an event with the next sequence number. The percentage is clamped to
 * 0–100 and floored at the previous event's value, so a late/duplicate update
 * can never make the progress bar regress. Older events are trimmed from the
 * front once the cap is reached, but their sequence numbers are preserved.
 */
export function appendJobEvent(job: ReplayJob, input: JobEventInput): ReplayJob {
  const at = input.at ?? new Date().toISOString();
  const previous = job.events.at(-1);
  const percent = Math.max(previous?.percent ?? 0, Math.min(100, Math.max(0, Math.round(input.percent))));
  const event: ReplayJobEvent = {
    seq: (previous?.seq ?? 0) + 1,
    at,
    phase: input.phase,
    message: input.message,
    percent,
    level: input.level ?? 'info',
  };

  const events = [...job.events, event].slice(-MAX_JOB_EVENTS);
  return { ...job, events, updatedAt: at };
}

/** The latest event, or `null` for a job that has not started yet. */
export function latestJobEvent(job: ReplayJob): ReplayJobEvent | null {
  return job.events.at(-1) ?? null;
}

/** Events after `afterSeq` (exclusive), for SSE reconnect. */
export function eventsAfter(job: ReplayJob, afterSeq: number): ReplayJobEvent[] {
  return job.events.filter((event) => event.seq > afterSeq);
}
