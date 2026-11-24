/**
 * Batched replay transport (#2341).
 *
 * Batches are bounded by event count; failed sends retry with exponential
 * backoff a fixed number of times, and the pending queue is capped so an
 * offline tab cannot grow memory without bound (overflow is counted and
 * reported with the next batch). On page hide the remainder goes out via
 * `sendBeacon`, which survives navigation.
 */

import { LIMITS, type ReplayEvent, type SessionMeta } from './schema';

export const INGEST_ENDPOINT = '/api/session-replay';

export interface TransportDeps {
  fetch?: typeof fetch;
  sendBeacon?: (url: string, data: Blob) => boolean;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface TransportOptions {
  endpoint?: string;
  maxBatch?: number;
  maxQueue?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export interface IngestPayload {
  kind: 'ingest';
  session: SessionMeta;
  seq: number;
  droppedEvents: number;
  events: ReplayEvent[];
}

export interface Transport {
  enqueue(events: readonly ReplayEvent[]): void;
  flush(): Promise<boolean>;
  flushOnHide(): void;
  pending(): number;
  dropped(): number;
  dispose(): void;
}

export function createTransport(session: SessionMeta, deps: TransportDeps = {}, options: TransportOptions = {}): Transport {
  const endpoint = options.endpoint ?? INGEST_ENDPOINT;
  const maxBatch = Math.min(options.maxBatch ?? 200, LIMITS.eventsPerBatch);
  const maxQueue = options.maxQueue ?? 2_000;
  const interval = options.flushIntervalMs ?? 5_000;
  const maxRetries = options.maxRetries ?? 3;
  const baseBackoff = options.baseBackoffMs ?? 1_000;
  const doFetch = deps.fetch ?? (typeof fetch === 'undefined' ? undefined : fetch.bind(globalThis));
  const schedule = deps.setTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const cancel = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let queue: ReplayEvent[] = [];
  let seq = 0;
  let dropped = 0;
  let reportedDropped = 0;
  let timer: unknown = null;
  let inFlight = false;
  let disposed = false;

  const payload = (events: ReplayEvent[]): IngestPayload => {
    seq += 1;
    const delta = dropped - reportedDropped;
    reportedDropped = dropped;
    return { kind: 'ingest', session, seq, droppedEvents: delta, events };
  };

  const arm = () => {
    if (timer !== null || disposed) return;
    timer = schedule(() => {
      timer = null;
      void flush();
    }, interval);
  };

  const enqueue = (events: readonly ReplayEvent[]) => {
    if (disposed || events.length === 0) return;
    queue.push(...events);
    if (queue.length > maxQueue) {
      dropped += queue.length - maxQueue;
      queue = queue.slice(queue.length - maxQueue);
    }
    if (queue.length >= maxBatch) void flush();
    else arm();
  };

  const send = async (body: IngestPayload): Promise<boolean> => {
    if (!doFetch) return false;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        });
        if (response.ok) return true;
        // 4xx (other than 429) will not succeed on retry.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) return false;
      } catch {
        // network error: retry below
      }
      if (attempt < maxRetries) {
        await new Promise<void>((resolve) => schedule(resolve, baseBackoff * 2 ** attempt));
      }
    }
    return false;
  };

  const flush = async (): Promise<boolean> => {
    if (inFlight || queue.length === 0) return true;
    inFlight = true;
    const batch = queue.slice(0, maxBatch);
    queue = queue.slice(batch.length);
    const ok = await send(payload(batch));
    if (!ok) {
      // Requeue at the front, respecting the cap.
      queue = [...batch, ...queue];
      if (queue.length > maxQueue) {
        dropped += queue.length - maxQueue;
        queue = queue.slice(0, maxQueue);
      }
    }
    inFlight = false;
    if (queue.length > 0) arm();
    return ok;
  };

  const flushOnHide = () => {
    if (queue.length === 0 || !deps.sendBeacon) return;
    while (queue.length > 0) {
      const batch = queue.slice(0, maxBatch);
      const sent = deps.sendBeacon(endpoint, new Blob([JSON.stringify(payload(batch))], { type: 'application/json' }));
      if (!sent) break;
      queue = queue.slice(batch.length);
    }
  };

  return {
    enqueue,
    flush,
    flushOnHide,
    pending: () => queue.length,
    dropped: () => dropped,
    dispose: () => {
      disposed = true;
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
