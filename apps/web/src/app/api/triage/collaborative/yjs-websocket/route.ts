/**
 * Mock y-websocket server endpoint (#2192).
 *
 * In production, this would be a WebSocket server using the y-websocket
 * protocol for real-time CRDT sync. Since Next.js API routes don't
 * support raw WebSocket upgrades, we simulate the connection using SSE
 * for downstream messages and POST for upstream messages.
 *
 * Uses the existing RBAC system for auth and the mock Redis adapter
 * for multi-instance broadcasting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisAdapter, getTriageChannel } from './redis-adapter';
import { validateTriageSession } from '../auth';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET(request: NextRequest): Promise<Response> {
  const session = await validateTriageSession(request);
  if (!session.permissions.read) {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');
  if (!runId) {
    return new Response('Missing runId', { status: 400 });
  }

  const channel = getTriageChannel(runId);
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Subscribe to updates from the Redis adapter (mock).
      const handler = (message: unknown) => {
        if (closed) return;
        try {
          const data = `data: ${JSON.stringify(message)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller may be closed.
        }
      };

      redisAdapter.subscribe(channel, handler);

      // Heartbeat every 15s.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // Ignore.
        }
      }, 15_000);

      // Cleanup when client disconnects.
      request.signal?.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        redisAdapter.unsubscribe(channel, handler);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      closed = true;
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

/**
 * POST handler for upstream messages (client -> server CRDT updates).
 */
export async function POST(request: NextRequest) {
  const session = await validateTriageSession(request);
  if (!session.permissions.write) {
    return NextResponse.json({ error: 'Write permission required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { runId, update } = body;
    if (!runId) {
      return NextResponse.json({ error: 'Missing runId' }, { status: 400 });
    }

    // Broadcast the update to all subscribers (other clients).
    const channel = getTriageChannel(runId);
    redisAdapter.publish(channel, { type: 'update', update, from: session.principal });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
