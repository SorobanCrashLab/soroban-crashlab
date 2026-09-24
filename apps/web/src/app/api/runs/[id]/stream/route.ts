import type { FuzzingRun } from '@/app/types';
import { isTerminalStatus } from '@/lib/run-status';
import type {
  RunStatusEvent,
  RunStreamEnvelope,
  RunStreamPayload,
  StaticRunEvent,
} from '@/lib/run-stream';
import { selectRunStorageDriver } from '@/lib/storage';
import { sanitizeSearchParams } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const encoder = new TextEncoder();

function frame(envelope: RunStreamEnvelope): Uint8Array {
  return encoder.encode(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`);
}

function statusEvent(run: FuzzingRun): RunStatusEvent {
  return {
    type: 'RUN_STATUS',
    status: run.status,
    metrics: { seedCount: run.seedCount, duration: run.duration },
  };
}

function staticEvent(run: FuzzingRun): StaticRunEvent {
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = selectRunStorageDriver();
  const run = await driver.getRun(id);
  if (!run) return new Response('Run not found', { status: 404 });

  const sanitizedAfter = sanitizeSearchParams(new URL(request.url).searchParams).get('after');
  const requestedAfter = sanitizedAfter ?? request.headers.get('Last-Event-ID') ?? '0';
  const after = Math.max(0, Number(requestedAfter) || 0);
  let sequence = after;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSnapshot = run;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearTimeout(pollTimer);
        controller.close();
      };

      const send = (event: RunStreamPayload) => {
        if (closed) return;
        sequence += 1;
        controller.enqueue(frame({ seq: sequence, runId: id, event }));
      };

      // A completed/failed/cancelled run has no future state transition to
      // stream. Send its persisted snapshot once and close instead of inventing
      // progress or leaving a reconnecting EventSource open forever.
      if (isTerminalStatus(run.status)) {
        if (after === 0) send(staticEvent(run));
        close();
        return;
      }

      if (after === 0) send(statusEvent(run));
      heartbeatTimer = setInterval(() => {
        send({ type: 'HEARTBEAT', at: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);

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
            send(statusEvent(latest));
            if (isTerminalStatus(latest.status)) {
              send(staticEvent(latest));
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
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearTimeout(pollTimer);
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
