import type { FuzzingRun } from '@/app/types';
import { isTerminalStatus } from '@/lib/run-status';
import {
  BoundedStreamQueue,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  encodeFrame,
  encodeHeartbeat,
  globalRunStreamRegistry,
  type RunStreamEnvelope,
  type RunStreamEvent,
  type RunStreamRegistry,
} from '@/lib/sse-stream';
import { selectRunStorageDriver } from '@/lib/storage';
import { sanitizeSearchParams } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = DEFAULT_HEARTBEAT_INTERVAL_MS;
const QUEUE_SIZE = DEFAULT_MAX_QUEUE_SIZE;
const encoder = new TextEncoder();

function statusEvent(run: FuzzingRun): RunStreamEvent {
  return {
    type: 'RUN_STATUS',
    status: run.status,
    metrics: { seedCount: run.seedCount, duration: run.duration },
  };
}

function staticEvent(run: FuzzingRun): RunStreamEvent {
  return {
    type: 'STATIC',
    status: run.status,
    metrics: { seedCount: run.seedCount, duration: run.duration },
    reason: 'terminal',
  };
}

function progressChanged(previous: FuzzingRun, next: FuzzingRun): boolean {
  return (
    previous.status !== next.status ||
    previous.seedCount !== next.seedCount ||
    previous.duration !== next.duration
  );
}

export interface StreamRouteOptions {
  registry?: RunStreamRegistry;
  heartbeatIntervalMs?: number;
  queueSize?: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  options: StreamRouteOptions = {},
) : Promise<Response> {
  const { id } = await params;
  const registry = options.registry ?? globalRunStreamRegistry;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const queueSize = options.queueSize ?? QUEUE_SIZE;
  const driver = selectRunStorageDriver();
  const run = await driver.getRun(id);
  if (!run) return new Response('Run not found', { status: 404 });

  if (!registry.acquire(id)) {
    return new Response('Too many concurrent streams for this run', {
      status: 429,
      headers: { 'Retry-After': '5' },
    });
  }

  const sanitizedAfter = sanitizeSearchParams(new URL(request.url).searchParams).get('after');
  const requestedAfter = sanitizedAfter ?? request.headers.get('Last-Event-ID') ?? '0';
  const after = Math.max(0, Number(requestedAfter) || 0);
  const log = registry.getLog(id);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSnapshot = run;
  let closed = false;
  let released = false;
  const queue = new BoundedStreamQueue<string>(queueSize);

  const release = () => {
    if (released) return;
    released = true;
    registry.release(id);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearTimeout(pollTimer);
        queue.clear();
        release();
        try {
          controller.close();
        } catch {
          // Controller may already be closed by a cancelled stream.
        }
      };

      // Encode and enqueue a frame, applying backpressure by dropping
      // oldest pending frames when the consumer is slow.
      const push = (frame: string) => {
        if (closed) return;
        const dropped = queue.enqueue(frame);
        if (dropped > 0) {
          // Signal the client that it is lagging. This frame is not
          // part of the replay log (best-effort hint), so it does not
          // consume a sequence number.
          const lagging: RunStreamEnvelope = {
            seq: log.lastId,
            runId: id,
            event: { type: 'LAGGING', dropped: queue.droppedCount },
          };
          // Replace the oldest pending frame with the lagging notice.
          queue.deQueue();
          queue.enqueue(encodeFrame(lagging));
        }
        drain();
      };

      const drain = () => {
        if (closed) return;
        // Only flush while the consumer has room. If desiredSize is
        // positive, the consumer is behind and we keep buffering in
        // the bounded queue instead of unbounded in-the-flight frames.
        while (queue.size > 0 && (controller.desiredSize ?? 0) > 0) {
          const next = queue.deQueue();
          if (next === undefined) break;
          try {
            controller.enqueue(encoder.encode(next));
          } catch {
            // Write failure indicates a dead peer; clean up immediately.
            close();
            return;
          }
        }
      };

      const sendEvent = (event: RunStreamEvent) => {
        if (closed) return;
        const envelope = log.append({ runId: id, event });
        push(encodeFrame(envelope));
      };

      // Replay any events the client missed while disconnected.
      const replay = log.replayAfter(after);
      if (replay.dropped > 0) {
        // The client fell off the ring buffer; tell it that it is lagging.
        const lagging: RunStreamEnvelope = {
          seq: log.lastId,
          runId: id,
          event: { type: 'LAGGING', dropped: replay.dropped },
        };
        push(encodeFrame(lagging));
      }
      for (const envelope of replay.events) {
        push(encodeFrame(envelope));
      }

      // A completed/failed/cancelled run has no future state transition to
      // stream. Send its persisted snapshot once and close instead of
      // inventing progress or leaving a reconnecting EventSource open
      // forever.
      if (isTerminalStatus(run.status)) {
        if (after === 0) sendEvent(staticEvent(run));
        close();
        return;
      }

      if (after === 0) sendEvent(statusEvent(run));

      heartbeatTimer = setInterval(() => {
        if (closed) return;
        // Heartbeats are comment frames and do not consume a sequence
        // number, so they can't be used to replay state.
        push(encodeHeartbeat());
      }, heartbeatIntervalMs);

      const poll = async () => {
        if (closed) return;

        try {
          const latest = await driver.getRun(id);
          if (!latest) {
            close();
            return;
          }

          if (progressChanged(lastSnapshot, latest)) {
            lastSnapshot = latest;
            sendEvent(statusEvent(latest));
            if (isTerminalStatus(latest.status)) {
              sendEvent(staticEvent(latest));
              close();
              return;
            }
          }
        } catch {
          // A failed snapshot lookup must not turn into fabricated telemetry.
          close();
          return;
        }

        if (!closed) pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      };

      pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    },
    cancel() {
      // Client disconnected: stop timers and release the connection slot.
      if (closed) return;
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearTimeout(pollTimer);
      queue.clear();
      release();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
