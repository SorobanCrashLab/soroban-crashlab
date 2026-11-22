/**
 * lib/replay/job-store — process-local job registry (#1876).
 *
 * Replay progress is ephemeral by nature: a job is interesting for the length
 * of a session and, at most, an hour after. The store is bounded in both
 * directions (max jobs, max age) so a long-lived process cannot leak, and it
 * exposes the same read shape the API and the result page need.
 *
 * Persistence note: the existing run stream is process-local too. A deployment
 * that fans replay out to workers would swap this class for the record-driver
 * layer without changing the model in `job-state.ts`.
 */

import { randomUUID } from 'node:crypto';
import {
  appendJobEvent,
  transitionJob,
  type JobEventInput,
  type ReplayJob,
  type ReplayJobStatus,
} from './job-state';
import type { EnvironmentCheck, ReplayEnvironment } from './environment';
import type { ReplayRunner } from './runners';
import type { ReplayFailure } from './failure';

export const DEFAULT_JOB_TTL_MS = 60 * 60 * 1_000;
export const MAX_RETAINED_JOBS = 200;

export interface CreateJobInput {
  sourceRunId: string;
  runner: ReplayRunner;
  requestedBy: string;
  environment?: ReplayEnvironment;
  environmentCheck?: EnvironmentCheck;
  now?: string;
}

export interface JobStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  maxJobs?: number;
}

export class ReplayJobStore {
  private readonly jobs = new Map<string, ReplayJob>();
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly maxJobs: number;

  constructor(options: JobStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? DEFAULT_JOB_TTL_MS;
    this.maxJobs = options.maxJobs ?? MAX_RETAINED_JOBS;
  }

  /** Creates a queued job and records its first event. */
  create(input: CreateJobInput): ReplayJob {
    this.prune();
    const at = input.now ?? this.now().toISOString();
    const job: ReplayJob = {
      id: `replay-job-${randomUUID()}`,
      sourceRunId: input.sourceRunId,
      runner: input.runner,
      status: 'queued',
      createdAt: at,
      updatedAt: at,
      requestedBy: input.requestedBy,
      ...(input.environment ? { environment: input.environment } : {}),
      ...(input.environmentCheck ? { environmentCheck: input.environmentCheck } : {}),
      events: [],
    };
    const queued = appendJobEvent(job, {
      phase: 'queued',
      message: 'Replay queued.',
      percent: 0,
      at,
    });

    this.jobs.set(queued.id, queued);
    this.enforceCapacity();
    return queued;
  }

  get(id: string): ReplayJob | null {
    this.prune();
    return this.jobs.get(id) ?? null;
  }

  /** Most recent first; used by the run page's replay history strip. */
  listBySource(sourceRunId: string): ReplayJob[] {
    this.prune();
    return [...this.jobs.values()]
      .filter((job) => job.sourceRunId === sourceRunId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  appendEvent(id: string, input: JobEventInput): ReplayJob | null {
    const current = this.jobs.get(id);
    if (!current) return null;
    const next = appendJobEvent(current, input);
    this.jobs.set(id, next);
    return next;
  }

  transition(
    id: string,
    to: ReplayJobStatus,
    patch: { failure?: ReplayFailure; result?: ReplayJob['result']; at?: string } = {},
  ): ReplayJob | null {
    const current = this.jobs.get(id);
    if (!current) return null;
    const result = transitionJob(current, to, { ...patch, at: patch.at ?? this.now().toISOString() });
    if (!result.ok) return current;
    this.jobs.set(id, result.job);
    return result.job;
  }

  /** Drops jobs older than the TTL. Called on every read; O(n) but n is small. */
  prune(): void {
    const cutoff = this.now().getTime() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if (Date.parse(job.updatedAt) < cutoff) this.jobs.delete(id);
    }
  }

  /** Bounded memory: drop the oldest jobs once the cap is exceeded. */
  private enforceCapacity(): void {
    if (this.jobs.size <= this.maxJobs) return;
    const ordered = [...this.jobs.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
    for (const job of ordered.slice(0, this.jobs.size - this.maxJobs)) {
      this.jobs.delete(job.id);
    }
  }

  /** Test helper; not used by production routes. */
  reset(): void {
    this.jobs.clear();
  }
}

export const replayJobStore = new ReplayJobStore();
