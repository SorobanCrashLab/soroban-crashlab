import { describe, expect, it } from 'vitest';
import {
  createDlqEntry,
  createInMemoryDlqGateway,
  DeadLetterQueue,
  deriveReplayKey,
  DLQ_REPLAY_CONCURRENCY,
  DLQ_RETENTION_DAYS,
  DLQ_RETENTION_MS,
  filterDlqEntries,
  sweepExpiredEntries,
  type DlqEntry,
  type DlqReplayOutcome,
} from './webhook-dlq';
import {
  WebhookDeliveryWorker,
  type WebhookDeliveryAdapter,
  type WebhookDeliveryRequest,
} from './webhook-delivery-worker';

const request: WebhookDeliveryRequest = {
  id: 'req-1',
  url: 'https://hooks.example.com/crashlab',
  eventType: 'crash.detected',
  payload: { runId: 'run-42' },
};

const entry = (overrides: Partial<DlqEntry> = {}): DlqEntry => ({
  id: 'dlq-req-1',
  requestId: 'req-1',
  endpoint: 'https://hooks.example.com/crashlab',
  eventType: 'crash.detected',
  payload: { runId: 'run-42' },
  reason: 'retries-exhausted',
  errorTimeline: [{ attempt: 1, error: 'HTTP 500', at: '2026-01-01T00:00:00.000Z' }],
  firstFailedAt: '2026-01-01T00:00:00.000Z',
  deadLetteredAt: '2026-01-01T00:00:02.000Z',
  replayAttempts: 0,
  ...overrides,
});

function makeQueue(
  seed: DlqEntry[],
  replayDelivery: (entry: DlqEntry, key: string) => Promise<DlqReplayOutcome>,
  now = () => new Date('2026-01-02T00:00:00.000Z'),
) {
  const gateway = createInMemoryDlqGateway(seed);
  return { gateway, queue: new DeadLetterQueue({ gateway, replayDelivery, now }) };
}

describe('delivery worker transition to DLQ', () => {
  const failingAdapter = (result: { ok: boolean; statusCode?: number; error?: string }): WebhookDeliveryAdapter => ({
    deliver: async () => result,
  });

  it('dead-letters a delivery once the retry budget is exhausted', async () => {
    const captured: DlqEntry[] = [];
    const worker = new WebhookDeliveryWorker({
      adapter: failingAdapter({ ok: false, statusCode: 500, error: 'HTTP 500' }),
      maxAttempts: 3,
      delay: async () => undefined,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      onDeadLetter: (dead) => captured.push(dead),
    });

    worker.enqueue(request);
    worker.start();
    await worker.drain();

    expect(captured).toHaveLength(1);
    expect(captured[0].reason).toBe('retries-exhausted');
    expect(captured[0].endpoint).toBe(request.url);
    expect(captured[0].payload).toEqual({ runId: 'run-42' });
    // Every attempt is preserved, not just the last one.
    expect(captured[0].errorTimeline.map((note) => note.attempt)).toEqual([1, 2, 3]);
  });

  it('dead-letters a non-retryable status without burning the budget', async () => {
    const captured: DlqEntry[] = [];
    const worker = new WebhookDeliveryWorker({
      adapter: failingAdapter({ ok: false, statusCode: 400, error: 'HTTP 400' }),
      maxAttempts: 3,
      delay: async () => undefined,
      onDeadLetter: (dead) => captured.push(dead),
    });

    worker.enqueue(request);
    worker.start();
    await worker.drain();

    expect(captured).toHaveLength(1);
    expect(captured[0].reason).toBe('non-retryable');
    expect(captured[0].errorTimeline).toHaveLength(1);
  });

  it('does not dead-letter a successful delivery', async () => {
    const captured: DlqEntry[] = [];
    const worker = new WebhookDeliveryWorker({
      adapter: failingAdapter({ ok: true, statusCode: 200 }),
      delay: async () => undefined,
      onDeadLetter: (dead) => captured.push(dead),
    });

    worker.enqueue(request);
    worker.start();
    await worker.drain();

    expect(captured).toEqual([]);
  });
});

describe('queue browsing', () => {
  const entries = [
    entry({ id: 'a', endpoint: 'https://hooks.example.com/alpha' }),
    entry({ id: 'b', endpoint: 'https://other.example.com/beta', reason: 'non-retryable' }),
    entry({ id: 'c', endpoint: 'https://hooks.example.com/gamma', deadLetteredAt: '2025-11-01T00:00:00.000Z' }),
  ];
  const now = Date.parse('2026-01-02T00:00:00.000Z');

  it('filters by endpoint substring', () => {
    expect(filterDlqEntries(entries, { endpoint: 'hooks.example.com' }, now).map((e) => e.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('filters by failure reason', () => {
    expect(filterDlqEntries(entries, { reason: 'non-retryable' }, now).map((e) => e.id)).toEqual(['b']);
  });

  it('filters by age', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(filterDlqEntries(entries, { maxAgeMs: week }, now).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns everything with no filter', () => {
    expect(filterDlqEntries(entries, {}, now)).toHaveLength(3);
  });
});

describe('retention policy', () => {
  it('pins the default retention at 30 days', () => {
    expect(DLQ_RETENTION_DAYS).toBe(30);
    expect(DLQ_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('evicts entries past the window and keeps the rest', () => {
    const now = Date.parse('2026-02-01T00:00:00.000Z');
    const fresh = entry({ id: 'fresh', deadLetteredAt: '2026-01-25T00:00:00.000Z' });
    const stale = entry({ id: 'stale', deadLetteredAt: '2025-12-01T00:00:00.000Z' });

    const { kept, evicted } = sweepExpiredEntries([fresh, stale], now);
    expect(kept.map((e) => e.id)).toEqual(['fresh']);
    expect(evicted.map((e) => e.id)).toEqual(['stale']);
  });

  it('sweeps through the queue and persists the survivors', () => {
    const { gateway, queue } = makeQueue(
      [
        entry({ id: 'fresh', deadLetteredAt: '2026-01-25T00:00:00.000Z' }),
        entry({ id: 'stale', deadLetteredAt: '2025-01-01T00:00:00.000Z' }),
      ],
      async () => ({ ok: true }),
      () => new Date('2026-02-01T00:00:00.000Z'),
    );

    expect(queue.sweep()).toBe(1);
    expect(gateway.load().map((e) => e.id)).toEqual(['fresh']);
    // A second sweep has nothing left to do.
    expect(queue.sweep()).toBe(0);
  });
});

describe('replay', () => {
  it('derives the idempotency key from entry id and attempt', () => {
    expect(deriveReplayKey('dlq-req-1', 1)).toBe('dlq-req-1#replay-1');
    expect(deriveReplayKey('dlq-req-1', 1)).toBe(deriveReplayKey('dlq-req-1', 1));
    expect(deriveReplayKey('dlq-req-1', 2)).not.toBe(deriveReplayKey('dlq-req-1', 1));
  });

  it('removes the entry when the replay succeeds', async () => {
    const keys: string[] = [];
    const { gateway, queue } = makeQueue([entry()], async (_entry, key) => {
      keys.push(key);
      return { ok: true };
    });

    const result = await queue.replay('dlq-req-1');
    expect(result.status).toBe('replayed');
    expect(result.idempotencyKey).toBe('dlq-req-1#replay-1');
    expect(keys).toEqual(['dlq-req-1#replay-1']);
    expect(gateway.load()).toEqual([]);
  });

  it('re-queues a failed replay with the attempt appended to its history', async () => {
    const { gateway, queue } = makeQueue([entry()], async () => ({
      ok: false,
      statusCode: 502,
      error: 'HTTP 502',
    }));

    const result = await queue.replay('dlq-req-1');
    expect(result.status).toBe('failed');

    const [stored] = gateway.load();
    expect(stored.replayAttempts).toBe(1);
    expect(stored.errorTimeline).toHaveLength(2);
    expect(stored.errorTimeline.at(-1)).toMatchObject({ statusCode: 502, error: 'HTTP 502' });

    // The next replay derives a fresh key rather than reusing the failed one.
    await queue.replay('dlq-req-1');
    expect(gateway.load()[0].replayAttempts).toBe(2);
    expect(gateway.load()[0].errorTimeline).toHaveLength(3);
  });

  it('reports a missing entry rather than throwing', async () => {
    const { queue } = makeQueue([], async () => ({ ok: true }));
    expect(await queue.replay('nope')).toEqual({ status: 'missing', entryId: 'nope' });
  });

  it('locks an entry while its replay is in flight', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const { gateway, queue } = makeQueue([entry()], async () => {
      calls += 1;
      await gate;
      return { ok: true };
    });

    const first = queue.replay('dlq-req-1');
    expect(queue.isLocked('dlq-req-1')).toBe(true);

    const second = await queue.replay('dlq-req-1');
    expect(second).toEqual({ status: 'locked', entryId: 'dlq-req-1' });

    release?.();
    expect((await first).status).toBe('replayed');
    // The delivery ran exactly once despite the double click.
    expect(calls).toBe(1);
    expect(queue.isLocked('dlq-req-1')).toBe(false);
    expect(gateway.load()).toEqual([]);
  });
});

describe('batch replay', () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    entry({ id: `dlq-${index}`, requestId: `req-${index}` }),
  );

  it('runs sequential batches capped at the concurrency limit', async () => {
    expect(DLQ_REPLAY_CONCURRENCY).toBe(5);

    let inFlight = 0;
    let peak = 0;
    const { queue } = makeQueue(many, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { ok: true };
    });

    const result = await queue.replayBatch(many.map((e) => e.id));
    expect(result.replayed).toBe(12);
    expect(result.batches).toBe(3);
    expect(peak).toBeLessThanOrEqual(DLQ_REPLAY_CONCURRENCY);
  });

  it('leaves partial failures in the queue with updated attempt notes', async () => {
    const { gateway, queue } = makeQueue(many.slice(0, 4), async (target) =>
      target.id === 'dlq-1' ? { ok: false, error: 'still down' } : { ok: true },
    );

    const result = await queue.replayBatch(many.slice(0, 4).map((e) => e.id));
    expect(result.replayed).toBe(3);
    expect(result.failed).toBe(1);

    const remaining = gateway.load();
    expect(remaining.map((e) => e.id)).toEqual(['dlq-1']);
    expect(remaining[0].replayAttempts).toBe(1);
    expect(remaining[0].errorTimeline.at(-1)?.error).toBe('still down');
  });
});

describe('entry construction', () => {
  it('carries the request context and dates the entry from its first failure', () => {
    const built = createDlqEntry({
      request,
      timeline: [
        { attempt: 1, error: 'HTTP 500', at: '2026-01-01T00:00:00.000Z' },
        { attempt: 2, error: 'HTTP 500', at: '2026-01-01T00:00:01.000Z' },
      ],
      reason: 'retries-exhausted',
      now: '2026-01-01T00:00:02.000Z',
    });

    expect(built.id).toBe('dlq-req-1');
    expect(built.endpoint).toBe(request.url);
    expect(built.firstFailedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(built.deadLetteredAt).toBe('2026-01-01T00:00:02.000Z');
    expect(built.replayAttempts).toBe(0);
  });
});
