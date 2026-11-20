/**
 * GET /api/runs/stream — Global SSE endpoint (#2191).
 *
 * Opens a persistent Server-Sent Events stream that pushes run events to
 * connected clients. Supports optional ?campaignId= for filtering.
 *
 * Events: run.created, run.status_changed, run.metrics_updated,
 * run.crashed, run.completed, artifact.uploaded
 *
 * Heartbeat every 15s. Uses the mock Redis subscriber for pub/sub
 * (would use real Redis in production for horizontal scaling).
 */

import { buildMockRuns } from '@/app/mockRuns';
import type { FuzzingRun } from '@/app/types';
import { isTerminalStatus } from '@/lib/run-status';
import { encodeHeartbeat } from '@/lib/sse-stream';
import { sanitizeSearchParams } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 5_000;
const encoder = new TextEncoder();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const campaignId = sanitizeSearchParams(url.searchParams).get('campaignId');
  const heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastSeq = 0;

  const allRuns = buildMockRuns();
  const filteredRuns = campaignId
    ? allRuns.filter((r) => r.area === campaignId)
    : allRuns;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearTimeout(pollTimer);
        try {
          controller.close();
        } catch {
          // Controller may already be closed.
        }
      };

      // Send initial snapshot.
      for (const run of filteredRuns.slice(0, 5)) {
        lastSeq++;
        const event = `event: run.created\ndata: ${JSON.stringify({ seq: lastSeq, event: { type: 'run.created', run } })}\n\n`;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          close();
          return;
        }
      }

      // Heartbeat.
      const hbTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeHeartbeat()));
        } catch {
          close();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Poll for changes (mock — production would use Redis pub/sub).
      const doPoll = async () => {
        if (closed) return;
        // In production, this would be driven by Redis pub/sub events.
        // For now, we just send periodic heartbeats.
        if (!closed) {
          const timer = setTimeout(() => void doPoll(), POLL_INTERVAL_MS);
          // Store timer reference for cleanup.
          (close as any)._pollTimer = timer;
        }
      };

      // Start polling.
      void doPoll();

      // Cleanup when client disconnects.
      request.signal?.addEventListener('abort', () => {
        close();
      });
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
