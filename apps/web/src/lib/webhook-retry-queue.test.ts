import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeBackoffMs } from './retry-backoff';
import {
  createInMemoryRetryQueueGateway,
  retryTargetOf,
  WebhookRetryQueue,
  WEBHOOK_RETRY_PER_TARGET_CONCURRENCY,
  type RetryJob,
} from './webhook-retry-queue';
import {
  createInMemoryDlqGateway,
  DeadLetterQueue,
  DLQ_PARK_AFTER_ROUNDS,
  type DlqEntry,
} from './webhook-dlq';
import {
  WebhookDeliveryWorker,
  type WebhookDeliveryAdapter,
  type WebhookDeliveryRequest,
} from './webhook-delivery-worker';
import { createWebhookRecovery } from './webhook-recovery';
import { WebhookStore } from './webhook-store';
import { getAuditLog, resetAuditLog } from './audit/audit-sink';

const T0 = new Date('2026-01-01T00:00:00.000Z');

function clock(start: Date = T0) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function req(id: string, url = 'https://hooks.example.com/crashlab'): WebhookDeliveryRequest {
  return { id, url, eventType: 'crash.detected', payload: { runId: id } };
}

type Result = { ok: boolean; statusCode?: number; error?: string };

function scriptedAdapter(script: Result[] | ((request: WebhookDeliveryRequest) => Result)) {
  const calls: WebhookDeliveryRequest[] = [];
  const adapter: WebhookDeliveryAdapter = {
    deliver: async (request) => {
      calls.push(request);
      if (typeof script === 'function') return script(request);
      return script.shift() ?? { ok: true, statusCode: 200 };
    },
  };
  return { adapter, calls };
}

/** Midpoint jitter, so delays are exactly 3/4 of the backoff window. */
const midJitter = () => 0.5;

describe('computeBackoffMs', () => {
  const policy = { baseMs: 1_000, maxMs: 10_000 };

  it('grows exponentially within the [window/2, window] jitter band', () => {
    expect(computeBackoffMs(1, policy, () => 0)).toBe(500);
    expect(computeBackoffMs(1, policy, () => 1)).toBe(1_000);
    expect(computeBackoffMs(2, policy, () => 0)).toBe(1_000);
    expect(computeBackoffMs(3, policy, () => 1)).toBe(4_000);
  });

  it('never exceeds the cap however many attempts have failed', () => {
    expect(computeBackoffMs(30, policy, () => 1)).toBe(10_000);
    expect(computeBackoffMs(30, policy, () => 0)).toBe(5_000);
  });

  it('spreads a burst: different jitter draws give different delays', () => {
    const delays = new Set([0.1, 0.4, 0.9].map((r) => computeBackoffMs(3, policy, () => r)));
    expect(delays.size).toBe(3);
  });
});

describe('WebhookRetryQueue — scheduling and execution', () => {
  it('persists a job with a backed-off next attempt instead of retrying inline', () => {
    const c = clock();
    const gateway = createInMemoryRetryQueueGateway();
    const { adapter, calls } = scriptedAdapter([]);
    const queue = new WebhookRetryQueue({ gateway, adapter, now: c.now, random: midJitter });

    const job = queue.schedule({ request: req('d1'), attemptsMade: 1 });

    expect(calls).toHaveLength(0);
    expect(gateway.load()).toHaveLength(1);
    expect(job.status).toBe('pending');
    expect(job.target).toBe('hooks.example.com');
    // attempt 1 failed → window = base 30s → mid-jitter 22.5s
    expect(Date.parse(job.nextAttemptAt) - T0.getTime()).toBe(22_500);
  });

  it('only runs jobs whose next attempt is due', async () => {
    const c = clock();
    const { adapter, calls } = scriptedAdapter([{ ok: true, statusCode: 200 }]);
    const queue = new WebhookRetryQueue({ adapter, now: c.now, random: midJitter });
    queue.schedule({ request: req('d1'), attemptsMade: 1 });

    const early = await queue.runTick();
    expect(early.outcomes).toEqual([]);
    expect(calls).toHaveLength(0);

    c.advance(30_000);
    const due = await queue.runTick();
    expect(due.outcomes).toMatchObject([{ jobId: 'd1', outcome: 'delivered', attempt: 2 }]);
    expect(queue.depth()).toBe(0);
  });

  it('reschedules a retryable failure with a longer backoff', async () => {
    const c = clock();
    const { adapter } = scriptedAdapter([{ ok: false, statusCode: 503, error: 'HTTP 503' }]);
    const queue = new WebhookRetryQueue({ adapter, now: c.now, random: midJitter });
    queue.schedule({ request: req('d1'), attemptsMade: 1, immediate: true });

    const tick = await queue.runTick();
    const job = queue.get('d1')!;

    expect(tick.outcomes[0]).toMatchObject({ outcome: 'retry-scheduled', attempt: 2, statusCode: 503 });
    expect(job.status).toBe('pending');
    expect(job.leaseExpiresAt).toBeUndefined();
    // attempt 2 failed → window 60s → mid-jitter 45s
    expect(Date.parse(job.nextAttemptAt) - T0.getTime()).toBe(45_000);
    expect(job.timeline.map((note) => note.statusCode)).toEqual([503]);
  });

  it('dead-letters with the full timeline once the budget is exhausted', async () => {
    const c = clock();
    const dead: DlqEntry[] = [];
    const { adapter } = scriptedAdapter(() => ({ ok: false, statusCode: 500, error: 'HTTP 500' }));
    const queue = new WebhookRetryQueue({
      adapter,
      now: c.now,
      random: midJitter,
      maxAttempts: 3,
      onDeadLetter: (entry) => dead.push(entry),
    });
    queue.schedule({
      request: req('d1'),
      attemptsMade: 1,
      timeline: [{ attempt: 1, statusCode: 500, error: 'HTTP 500', at: T0.toISOString() }],
    });

    for (let i = 0; i < 5; i += 1) {
      c.advance(60 * 60_000);
      await queue.runTick();
    }

    expect(queue.depth()).toBe(0);
    expect(dead).toHaveLength(1);
    expect(dead[0].reason).toBe('retries-exhausted');
    expect(dead[0].errorTimeline.map((note) => note.attempt)).toEqual([1, 2, 3]);
    expect(queue.metrics.snapshot()).toMatchObject({ retryAttempts: 2, retriesScheduled: 1, deadLettered: 1 });
  });

  it('dead-letters a non-retryable status immediately', async () => {
    const dead: DlqEntry[] = [];
    const { adapter } = scriptedAdapter([{ ok: false, statusCode: 410, error: 'HTTP 410' }]);
    const queue = new WebhookRetryQueue({ adapter, onDeadLetter: (entry) => dead.push(entry) });
    queue.schedule({ request: req('d1'), attemptsMade: 0, immediate: true });

    await queue.runTick();

    expect(dead.map((entry) => entry.reason)).toEqual(['non-retryable']);
  });

  it('treats an adapter throw as a retryable network failure', async () => {
    const adapter: WebhookDeliveryAdapter = {
      deliver: async () => {
        throw new Error('socket hang up');
      },
    };
    const queue = new WebhookRetryQueue({ adapter });
    queue.schedule({ request: req('d1'), attemptsMade: 0, immediate: true });

    const tick = await queue.runTick();

    expect(tick.outcomes[0]).toMatchObject({ outcome: 'retry-scheduled', error: 'socket hang up' });
  });

  it('keeps one job per delivery when the same delivery is scheduled twice', () => {
    const queue = new WebhookRetryQueue({ adapter: scriptedAdapter([]).adapter });
    queue.schedule({ request: req('d1'), attemptsMade: 1 });
    queue.schedule({ request: req('d1'), attemptsMade: 0, immediate: true });
    expect(queue.depth()).toBe(1);
  });
});

describe('WebhookRetryQueue — caps', () => {
  it('caps in-flight attempts per target and leaves the rest for a later tick', async () => {
    const c = clock();
    const { adapter, calls } = scriptedAdapter(() => ({ ok: true, statusCode: 200 }));
    const queue = new WebhookRetryQueue({ adapter, now: c.now });
    for (let i = 0; i < 5; i += 1) {
      queue.schedule({ request: req(`sick-${i}`, 'https://sick.example.com/hook'), attemptsMade: 0, immediate: true });
    }
    queue.schedule({ request: req('healthy', 'https://ok.example.com/hook'), attemptsMade: 0, immediate: true });

    const tick = await queue.runTick();

    const sickCalls = calls.filter((call) => retryTargetOf(call.url) === 'sick.example.com');
    expect(sickCalls).toHaveLength(WEBHOOK_RETRY_PER_TARGET_CONCURRENCY);
    expect(calls.some((call) => call.id === 'healthy')).toBe(true);
    expect(tick.throttled).toBe(5 - WEBHOOK_RETRY_PER_TARGET_CONCURRENCY);
    expect(queue.depth()).toBe(3);
    expect(queue.metrics.snapshot().throttledByTargetCap).toBe(3);
  });

  it('counts in-flight jobs claimed by an overlapping tick against the cap', async () => {
    const c = clock();
    const leased: RetryJob = {
      id: 'busy',
      request: req('busy'),
      target: 'hooks.example.com',
      attempt: 1,
      maxAttempts: 5,
      status: 'in-flight',
      nextAttemptAt: T0.toISOString(),
      leaseExpiresAt: new Date(T0.getTime() + 30_000).toISOString(),
      createdAt: T0.toISOString(),
      timeline: [],
    };
    const gateway = createInMemoryRetryQueueGateway([leased]);
    const { adapter, calls } = scriptedAdapter(() => ({ ok: true, statusCode: 200 }));
    const queue = new WebhookRetryQueue({ gateway, adapter, now: c.now, perTargetConcurrency: 1 });
    queue.schedule({ request: req('waiting'), attemptsMade: 0, immediate: true });

    await queue.runTick();

    expect(calls).toEqual([]);
  });

  it('bounds the number of jobs attempted in a single tick', async () => {
    const { adapter, calls } = scriptedAdapter(() => ({ ok: true, statusCode: 200 }));
    const queue = new WebhookRetryQueue({ adapter, maxJobsPerTick: 3, perTargetConcurrency: 100 });
    for (let i = 0; i < 10; i += 1) queue.schedule({ request: req(`d${i}`), attemptsMade: 0, immediate: true });

    await queue.runTick();

    expect(calls).toHaveLength(3);
    expect(queue.depth()).toBe(7);
  });
});

describe('WebhookRetryQueue — recovery across serverless boundaries', () => {
  it('reclaims a job whose tick died mid-attempt once the lease lapses', async () => {
    const c = clock();
    const gateway = createInMemoryRetryQueueGateway();
    const hanging: WebhookDeliveryAdapter = { deliver: () => new Promise(() => undefined) };
    const dying = new WebhookRetryQueue({ gateway, adapter: hanging, now: c.now, leaseMs: 60_000 });
    dying.schedule({ request: req('d1'), attemptsMade: 1, immediate: true });

    // The first tick claims the job, then its function is killed mid-attempt.
    void dying.runTick();
    await Promise.resolve();
    expect(gateway.load()[0]).toMatchObject({ status: 'in-flight', attempt: 2 });

    // A fresh instance (next invocation) sees the live lease and waits…
    const { adapter, calls } = scriptedAdapter([{ ok: true, statusCode: 200 }]);
    const next = new WebhookRetryQueue({ gateway, adapter, now: c.now });
    await next.runTick();
    expect(calls).toHaveLength(0);

    // …and reclaims it once the lease has lapsed. The crashed attempt counts.
    c.advance(61_000);
    const tick = await next.runTick();
    expect(tick.outcomes).toMatchObject([{ jobId: 'd1', outcome: 'delivered', attempt: 3 }]);
    expect(gateway.load()).toEqual([]);
  });

  describe('with the file-backed webhook store', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
      dir = null;
    });

    it('survives a process restart between scheduling and the recovery tick', async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhook-retry-'));
      const c = clock();
      const first = new WebhookStore(dir);
      new WebhookRetryQueue({ gateway: first.retryQueueGateway(), adapter: scriptedAdapter([]).adapter, now: c.now })
        .schedule({ request: req('d1'), attemptsMade: 1 });

      // New process: nothing in memory, only what was written to disk.
      const restarted = new WebhookStore(dir);
      expect(restarted.getRetryQueue().map((job) => job.id)).toEqual(['d1']);

      c.advance(60_000);
      const { adapter } = scriptedAdapter([{ ok: true, statusCode: 200 }]);
      const tick = await new WebhookRetryQueue({ gateway: restarted.retryQueueGateway(), adapter, now: c.now }).runTick();
      expect(tick.outcomes[0].outcome).toBe('delivered');
      expect(new WebhookStore(dir).getRetryQueue()).toEqual([]);
    });
  });
});

describe('WebhookDeliveryWorker — hand-off to the durable queue', () => {
  it('queues a retryable failure instead of sleeping and retrying inline', async () => {
    const { adapter, calls } = scriptedAdapter([{ ok: false, statusCode: 503, error: 'HTTP 503' }]);
    const retryQueue = new WebhookRetryQueue({ adapter });
    let slept = false;
    const worker = new WebhookDeliveryWorker({
      adapter,
      retryQueue,
      maxAttempts: 4,
      delay: async () => {
        slept = true;
      },
    });

    worker.enqueue(req('d1'));
    worker.start();
    await worker.drain();

    expect(calls).toHaveLength(1);
    expect(slept).toBe(false);
    expect(retryQueue.get('d1')).toMatchObject({ attempt: 1, maxAttempts: 4, status: 'pending' });
    expect(retryQueue.get('d1')!.timeline).toHaveLength(1);
  });
});

describe('DeadLetterQueue.drain — automatic drain with escalation', () => {
  const entry = (id: string, overrides: Partial<DlqEntry> = {}): DlqEntry => ({
    id: `dlq-${id}`,
    requestId: id,
    endpoint: 'https://hooks.example.com/crashlab',
    eventType: 'crash.detected',
    payload: { runId: id },
    reason: 'retries-exhausted',
    errorTimeline: [{ attempt: 1, error: 'HTTP 500', at: T0.toISOString() }],
    firstFailedAt: T0.toISOString(),
    deadLetteredAt: T0.toISOString(),
    replayAttempts: 0,
    ...overrides,
  });

  afterEach(() => resetAuditLog());

  it('removes entries whose replay succeeds', async () => {
    const c = clock();
    const dlq = new DeadLetterQueue({
      gateway: createInMemoryDlqGateway([entry('a')]),
      replayDelivery: async () => ({ ok: true, statusCode: 200 }),
      now: c.now,
    });

    const result = await dlq.drain();

    expect(result).toMatchObject({ attempted: 1, replayed: 1, parked: [] });
    expect(dlq.depth()).toBe(0);
  });

  it(`parks an entry after ${DLQ_PARK_AFTER_ROUNDS} failed rounds and stops draining it`, async () => {
    const c = clock();
    let replays = 0;
    const dlq = new DeadLetterQueue({
      gateway: createInMemoryDlqGateway([entry('a')]),
      replayDelivery: async () => {
        replays += 1;
        return { ok: false, statusCode: 502, error: 'HTTP 502' };
      },
      now: c.now,
      random: midJitter,
    });

    const parkedIds: string[] = [];
    for (let round = 0; round < DLQ_PARK_AFTER_ROUNDS + 3; round += 1) {
      parkedIds.push(...(await dlq.drain()).parked);
      c.advance(24 * 60 * 60_000);
    }

    expect(replays).toBe(DLQ_PARK_AFTER_ROUNDS);
    expect(parkedIds).toEqual(['dlq-a']);
    expect(dlq.list({ status: 'parked' })).toHaveLength(1);
    expect(dlq.parkedDepth()).toBe(1);
    expect(getAuditLog().list().some((log) => log.action === 'dlq.park')).toBe(true);
  });

  it('backs off between rounds instead of replaying every tick', async () => {
    const c = clock();
    let replays = 0;
    const dlq = new DeadLetterQueue({
      gateway: createInMemoryDlqGateway([entry('a')]),
      replayDelivery: async () => {
        replays += 1;
        return { ok: false, statusCode: 500 };
      },
      now: c.now,
      random: midJitter,
    });

    await dlq.drain();
    c.advance(60_000);
    await dlq.drain();

    expect(replays).toBe(1);
    expect(Date.parse(dlq.list()[0].nextDrainAt!)).toBeGreaterThan(c.now().getTime());
  });

  it('leaves non-retryable entries for a human rather than replaying them', async () => {
    let replays = 0;
    const dlq = new DeadLetterQueue({
      gateway: createInMemoryDlqGateway([entry('a', { reason: 'non-retryable' })]),
      replayDelivery: async () => {
        replays += 1;
        return { ok: true };
      },
    });

    await dlq.drain();

    expect(replays).toBe(0);
    expect(dlq.depth()).toBe(1);
  });

  it('caps replays per receiver so a sick endpoint is not hammered', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`e${i}`));
    let replays = 0;
    const dlq = new DeadLetterQueue({
      gateway: createInMemoryDlqGateway(entries),
      replayDelivery: async () => {
        replays += 1;
        return { ok: false, statusCode: 503 };
      },
    });

    const result = await dlq.drain({ perTarget: 2 });

    expect(replays).toBe(2);
    expect(result.deferred).toBe(4);
  });
});

describe('createWebhookRecovery — one tick end to end', () => {
  it('runs retries, dead-letters exhaustion, drains and reports metrics', async () => {
    const c = clock();
    const retryGateway = createInMemoryRetryQueueGateway();
    const dlqGateway = createInMemoryDlqGateway();
    const { adapter } = scriptedAdapter((request) =>
      request.id === 'good' ? { ok: true, statusCode: 200 } : { ok: false, statusCode: 500, error: 'HTTP 500' },
    );
    const recovery = createWebhookRecovery({ retryGateway, dlqGateway, adapter, now: c.now, random: midJitter });

    recovery.queue.schedule({ request: req('good'), attemptsMade: 1, immediate: true });
    recovery.queue.schedule({ request: { ...req('bad'), maxAttempts: 2 }, attemptsMade: 1, immediate: true });
    c.advance(5_000);

    const tick = await recovery.runTick();

    expect(tick.retries.outcomes.map((o) => [o.jobId, o.outcome]).sort()).toEqual([
      ['bad', 'dead-lettered'],
      ['good', 'delivered'],
    ]);
    // The fresh dead letter is drained in the same tick (it is due immediately).
    expect(tick.drain.attempted).toBe(1);

    const metrics = recovery.metrics();
    expect(metrics).toMatchObject({
      recoveredDeliveries: 1,
      deadLettered: 1,
      pendingRetries: 0,
      dlqDepth: 1,
      parkedDepth: 0,
    });
    expect(metrics.deliveryLatencyMs.count).toBe(1);
    expect(metrics.deliveryLatencyMs.max).toBe(5_000);
  });

  it('sends a deterministic Idempotency-Key when draining', async () => {
    const { adapter, calls } = scriptedAdapter([{ ok: true, statusCode: 200 }]);
    const recovery = createWebhookRecovery({
      retryGateway: createInMemoryRetryQueueGateway(),
      dlqGateway: createInMemoryDlqGateway([
        {
          id: 'dlq-x',
          requestId: 'x',
          endpoint: 'https://hooks.example.com/crashlab',
          eventType: 'crash.detected',
          payload: {},
          reason: 'retries-exhausted',
          errorTimeline: [],
          firstFailedAt: T0.toISOString(),
          deadLetteredAt: T0.toISOString(),
          replayAttempts: 0,
        },
      ]),
      adapter,
    });

    const tick = await recovery.runTick();

    expect(calls[0].headers?.['Idempotency-Key']).toBe('dlq-x#replay-1');
    expect(tick.drainedRequestIds).toEqual(['x']);
  });
});
