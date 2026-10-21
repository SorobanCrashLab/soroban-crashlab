import { NextRequest } from 'next/server';
import { errorResponse, status } from '@/lib/api-response-utils';
import { eventsAfter, isTerminalJobStatus, type ReplayJobEvent } from '@/lib/replay/job-state';
import { replayJobStore } from '@/lib/replay/job-store';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 250;
const HEARTBEAT_INTERVAL_MS = 15_000;
const encoder = new TextEncoder();

function frame(event: ReplayJobEvent): string {
  return `id: ${event.seq}\nevent: replay\ndata: ${JSON.stringify(event)}\n\n`;
}

function doneFrame(id: string, status: string): string {
  return `event: done\ndata: ${JSON.stringify({ id, status })}\n\n`;
}

/**
 * GET /api/replay-jobs/[id]/stream?after=<seq>
 *
 * Server-sent progress for one replay job. `after` lets a reconnecting client
 * replay only what it missed; the sequence numbers are assigned by the job
 * model and never reused. The stream closes itself on a terminal status, so a
 * finished job cannot leave a tab subscribing forever.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return errorResponse('Replay job ID is required', status.badRequest);
  }

  const initial = replayJobStore.get(id);
  if (!initial) {
    return errorResponse('Replay job not found', status.notFound);
  }

  const requestedAfter = Number(request.nextUrl.searchParams.get('after') ?? '0');
  let cursor =
    Number.isFinite(requestedAfter) && requestedAfter > 0 ? Math.floor(requestedAfter) : 0;

  let poll: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const cleanup = () => {
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
        poll = undefined;
        heartbeat = undefined;
      };

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // The client may have aborted first; closing twice is harmless.
        }
      };

      const flush = () => {
        if (closed) return;
        const current = replayJobStore.get(id);
        if (!current) {
          close();
          return;
        }

        try {
          for (const event of eventsAfter(current, cursor)) {
            controller.enqueue(encoder.encode(frame(event)));
            cursor = event.seq;
          }

          if (isTerminalJobStatus(current.status)) {
            controller.enqueue(encoder.encode(doneFrame(current.id, current.status)));
            close();
          }
        } catch {
          // A disconnected client leaves the controller unusable; stop quietly.
          close();
        }
      };

      controller.enqueue(encoder.encode(': connected\n\n'));
      flush();
      if (closed) return;

      poll = setInterval(flush, POLL_INTERVAL_MS);
      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
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
