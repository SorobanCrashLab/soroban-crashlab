/**
 * Durable webhook retry queue (#1635).
 *
 * Retries used to run inline: the delivery worker slept between attempts
 * inside the request that triggered it, so a serverless timeout or crash
 * mid-loop silently lost the delivery, and a burst of failures to one receiver
 * turned into a retry storm against it.
 *
 * Retry attempts are now persisted jobs. Nothing sleeps: each job carries the
 * wall-clock time of its next attempt, and the webhook-recovery tick (driven
 * by the schedules tick infrastructure) picks up whatever is due.
 *
 *  - Backoff: exponential with equal jitter (`computeBackoffMs`).
 *  - Per-target cap: at most `perTargetConcurrency` in-flight attempts per
 *    receiver host, across overlapping ticks.
 *  - Crash safety: a job is claimed (status `in-flight`, lease written) before
 *    the attempt runs. If the tick dies, the lease lapses and the next tick
 *    reclaims it. The claim consumes the attempt, so a crash can never grant
 *    extra attempts beyond the budget.
 *  - Exhaustion hands the job to the dead-letter queue with its full timeline.
 */

import { computeBackoffMs, type BackoffPolicy } from './retry-backoff';
import { createDlqEntry, type DlqAttemptNote, type DlqEntry } from './webhook-dlq';
import {
  isRetryableDeliveryStatus,
  type WebhookDeliveryAdapter,
  type WebhookDeliveryRequest,
} from './webhook-delivery-worker';
import {
  WEBHOOK_RETRY_BACKOFF_BASE_MS,
  WEBHOOK_RETRY_BACKOFF_MAX_MS,
  WEBHOOK_RETRY_LEASE_MS,
} from './timeouts';

/** Total attempts (including the first, inline one) before dead-lettering. */
export const WEBHOOK_RETRY_MAX_ATTEMPTS = 5;
/** In-flight attempts allowed per receiver host at any moment. */
export const WEBHOOK_RETRY_PER_TARGET_CONCURRENCY = 2;
/** Jobs attempted per tick; keeps a tick well inside the function limit. */
export const WEBHOOK_RETRY_MAX_JOBS_PER_TICK = 20;

export type RetryJobStatus = 'pending' | 'in-flight';

export interface RetryJob {
  /** Same as the delivery request id: one job per delivery. */
  id: string;
  request: WebhookDeliveryRequest;
  /** Receiver host, the unit the concurrency cap applies to. */
  target: string;
  /** Attempts made (or claimed) so far. */
  attempt: number;
  maxAttempts: number;
  status: RetryJobStatus;
  nextAttemptAt: string;
  leaseExpiresAt?: string;
  /** When the delivery was first attempted; delivery latency is measured from here. */
  createdAt: string;
  timeline: DlqAttemptNote[];
}

export interface RetryQueueGateway {
  load(): RetryJob[];
  save(jobs: readonly RetryJob[]): void;
}

export function createInMemoryRetryQueueGateway(seed: readonly RetryJob[] = []): RetryQueueGateway {
  let jobs = [...seed];
  return {
    load: () => [...jobs],
    save: (next) => {
      jobs = [...next];
    },
  };
}

export function retryTargetOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────

export interface WebhookRetryMetricsSnapshot {
  /** Deliveries that succeeded on a queued retry. */
  recoveredDeliveries: number;
  /** Queued attempts executed (successful or not). */
  retryAttempts: number;
  /** Failed attempts that were rescheduled rather than dead-lettered. */
  retriesScheduled: number;
  deadLettered: number;
  /** Jobs skipped this far because their target was at its concurrency cap. */
  throttledByTargetCap: number;
  /** First attempt to successful delivery, for deliveries that needed retries. */
  deliveryLatencyMs: { count: number; sum: number; max: number; avg: number };
}

export class WebhookRetryMetrics {
  private recovered = 0;
  private attempts = 0;
  private scheduled = 0;
  private dead = 0;
  private throttled = 0;
  private latencyCount = 0;
  private latencySum = 0;
  private latencyMax = 0;

  recordAttempt(): void {
    this.attempts += 1;
  }

  recordRecovered(latencyMs: number): void {
    this.recovered += 1;
    const latency = Math.max(0, latencyMs);
    this.latencyCount += 1;
    this.latencySum += latency;
    this.latencyMax = Math.max(this.latencyMax, latency);
  }

  recordRetryScheduled(): void {
    this.scheduled += 1;
  }

  recordDeadLettered(): void {
    this.dead += 1;
  }

  recordThrottled(count: number): void {
    this.throttled += count;
  }

  snapshot(): WebhookRetryMetricsSnapshot {
    return {
      recoveredDeliveries: this.recovered,
      retryAttempts: this.attempts,
      retriesScheduled: this.scheduled,
      deadLettered: this.dead,
      throttledByTargetCap: this.throttled,
      deliveryLatencyMs: {
        count: this.latencyCount,
        sum: this.latencySum,
        max: this.latencyMax,
        avg: this.latencyCount === 0 ? 0 : Math.round(this.latencySum / this.latencyCount),
      },
    };
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────

export type RetryTickOutcomeKind = 'delivered' | 'retry-scheduled' | 'dead-lettered';

export interface RetryTickOutcome {
  jobId: string;
  outcome: RetryTickOutcomeKind;
  attempt: number;
  statusCode?: number;
  error?: string;
  nextAttemptAt?: string;
}

export interface RetryTickResult {
  outcomes: RetryTickOutcome[];
  /** Due jobs left for a later tick because their target was saturated. */
  throttled: number;
  pending: number;
}

export interface ScheduleRetryInput {
  request: WebhookDeliveryRequest;
  /** Attempts already made. 0 schedules a first attempt (e.g. a manual retry). */
  attemptsMade: number;
  timeline?: readonly DlqAttemptNote[];
  /** Run at the next tick rather than after a backoff delay. */
  immediate?: boolean;
  createdAt?: string;
}

export interface WebhookRetryQueueOptions {
  gateway?: RetryQueueGateway;
  adapter: WebhookDeliveryAdapter;
  onDeadLetter?: (entry: DlqEntry) => void;
  metrics?: WebhookRetryMetrics;
  now?: () => Date;
  random?: () => number;
  backoff?: BackoffPolicy;
  maxAttempts?: number;
  perTargetConcurrency?: number;
  maxJobsPerTick?: number;
  leaseMs?: number;
}

export class WebhookRetryQueue {
  readonly metrics: WebhookRetryMetrics;
  private readonly gateway: RetryQueueGateway;
  private readonly adapter: WebhookDeliveryAdapter;
  private readonly onDeadLetter?: (entry: DlqEntry) => void;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly backoff: BackoffPolicy;
  private readonly maxAttempts: number;
  private readonly perTargetConcurrency: number;
  private readonly maxJobsPerTick: number;
  private readonly leaseMs: number;

  constructor(options: WebhookRetryQueueOptions) {
    this.gateway = options.gateway ?? createInMemoryRetryQueueGateway();
    this.adapter = options.adapter;
    this.onDeadLetter = options.onDeadLetter;
    this.metrics = options.metrics ?? new WebhookRetryMetrics();
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.backoff = options.backoff ?? {
      baseMs: WEBHOOK_RETRY_BACKOFF_BASE_MS,
      maxMs: WEBHOOK_RETRY_BACKOFF_MAX_MS,
    };
    this.maxAttempts = options.maxAttempts ?? WEBHOOK_RETRY_MAX_ATTEMPTS;
    this.perTargetConcurrency = options.perTargetConcurrency ?? WEBHOOK_RETRY_PER_TARGET_CONCURRENCY;
    this.maxJobsPerTick = options.maxJobsPerTick ?? WEBHOOK_RETRY_MAX_JOBS_PER_TICK;
    this.leaseMs = options.leaseMs ?? WEBHOOK_RETRY_LEASE_MS;
  }

  list(): RetryJob[] {
    return this.gateway.load();
  }

  depth(): number {
    return this.gateway.load().length;
  }

  get(jobId: string): RetryJob | undefined {
    return this.gateway.load().find((job) => job.id === jobId);
  }

  /**
   * Persists a retry for a delivery. Scheduling the same delivery twice keeps
   * one job: a job currently in flight is left alone, a pending one is updated.
   */
  schedule(input: ScheduleRetryInput): RetryJob {
    const nowMs = this.now().getTime();
    const jobs = this.gateway.load();
    const existing = jobs.find((job) => job.id === input.request.id);
    if (existing && this.isLeased(existing, nowMs)) return existing;

    const delayMs = input.immediate ? 0 : computeBackoffMs(input.attemptsMade, this.backoff, this.random);
    const job: RetryJob = {
      id: input.request.id,
      request: input.request,
      target: retryTargetOf(input.request.url),
      attempt: input.attemptsMade,
      maxAttempts: Math.max(input.request.maxAttempts ?? this.maxAttempts, input.attemptsMade + 1),
      status: 'pending',
      nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
      createdAt: existing?.createdAt ?? input.createdAt ?? new Date(nowMs).toISOString(),
      timeline: [...(existing?.timeline ?? []), ...(input.timeline ?? [])],
    };

    this.gateway.save([...jobs.filter((candidate) => candidate.id !== job.id), job]);
    return job;
  }

  /**
   * Runs every due job the caps allow. Safe to call from overlapping ticks:
   * claims are persisted before any attempt starts.
   */
  async runTick(): Promise<RetryTickResult> {
    const now = this.now();
    const nowMs = now.getTime();
    const jobs = this.gateway.load();

    const inFlightByTarget = new Map<string, number>();
    for (const job of jobs) {
      if (this.isLeased(job, nowMs)) {
        inFlightByTarget.set(job.target, (inFlightByTarget.get(job.target) ?? 0) + 1);
      }
    }

    const due = jobs
      .filter((job) => !this.isLeased(job, nowMs) && Date.parse(job.nextAttemptAt) <= nowMs)
      .sort((a, b) => Date.parse(a.nextAttemptAt) - Date.parse(b.nextAttemptAt));

    const claimed: RetryJob[] = [];
    let throttled = 0;
    for (const job of due) {
      if (claimed.length >= this.maxJobsPerTick) break;
      const active = inFlightByTarget.get(job.target) ?? 0;
      if (active >= this.perTargetConcurrency) {
        throttled += 1;
        continue;
      }
      inFlightByTarget.set(job.target, active + 1);
      claimed.push({
        ...job,
        status: 'in-flight',
        attempt: job.attempt + 1,
        leaseExpiresAt: new Date(nowMs + this.leaseMs).toISOString(),
      });
    }
    if (throttled > 0) this.metrics.recordThrottled(throttled);

    if (claimed.length > 0) {
      const claimedIds = new Set(claimed.map((job) => job.id));
      this.gateway.save([...jobs.filter((job) => !claimedIds.has(job.id)), ...claimed]);
    }

    const outcomes = await Promise.all(claimed.map((job) => this.attempt(job)));
    return { outcomes, throttled, pending: this.depth() };
  }

  private async attempt(job: RetryJob): Promise<RetryTickOutcome> {
    this.metrics.recordAttempt();
    let result: Awaited<ReturnType<WebhookDeliveryAdapter['deliver']>>;
    try {
      result = await this.adapter.deliver(job.request);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const at = this.now();
    const atIso = at.toISOString();

    if (result.ok) {
      this.remove(job.id);
      this.metrics.recordRecovered(at.getTime() - Date.parse(job.createdAt));
      return { jobId: job.id, outcome: 'delivered', attempt: job.attempt, statusCode: result.statusCode };
    }

    const timeline: DlqAttemptNote[] = [
      ...job.timeline,
      { attempt: job.attempt, statusCode: result.statusCode, error: result.error ?? 'Delivery failed', at: atIso },
    ];
    const retryable = isRetryableDeliveryStatus(result.statusCode);

    if (retryable && job.attempt < job.maxAttempts) {
      const nextAttemptAt = new Date(
        at.getTime() + computeBackoffMs(job.attempt, this.backoff, this.random),
      ).toISOString();
      this.replace({ ...job, status: 'pending', leaseExpiresAt: undefined, nextAttemptAt, timeline });
      this.metrics.recordRetryScheduled();
      return {
        jobId: job.id,
        outcome: 'retry-scheduled',
        attempt: job.attempt,
        statusCode: result.statusCode,
        error: result.error,
        nextAttemptAt,
      };
    }

    this.remove(job.id);
    this.metrics.recordDeadLettered();
    this.onDeadLetter?.(
      createDlqEntry({
        request: job.request,
        timeline,
        reason: retryable ? 'retries-exhausted' : 'non-retryable',
        now: atIso,
      }),
    );
    return {
      jobId: job.id,
      outcome: 'dead-lettered',
      attempt: job.attempt,
      statusCode: result.statusCode,
      error: result.error,
    };
  }

  private isLeased(job: RetryJob, nowMs: number): boolean {
    return (
      job.status === 'in-flight' &&
      job.leaseExpiresAt !== undefined &&
      Date.parse(job.leaseExpiresAt) > nowMs
    );
  }

  private remove(jobId: string): void {
    this.gateway.save(this.gateway.load().filter((job) => job.id !== jobId));
  }

  private replace(updated: RetryJob): void {
    this.gateway.save(this.gateway.load().map((job) => (job.id === updated.id ? updated : job)));
  }
}
