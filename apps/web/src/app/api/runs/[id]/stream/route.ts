import type { Artifact } from '@/app/types';
import type { RunStreamEnvelope, RunStreamPayload } from '@/lib/run-stream';
import { selectRunStorageDriver } from '@/lib/storage';

export const dynamic = 'force-dynamic';
const encoder = new TextEncoder();

function frame(envelope: RunStreamEnvelope): Uint8Array {
  return encoder.encode(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await selectRunStorageDriver().getRun(id);
  if (!run) return new Response('Run not found', { status: 404 });

  const requestedAfter = new URL(request.url).searchParams.get('after') ?? request.headers.get('Last-Event-ID') ?? '0';
  const after = Math.max(0, Number(requestedAfter) || 0);
  // `updatedAt` is the correct field on the Artifact interface (types.ts). Using
  // `createdAt` here was a prior bug that broke the TypeScript build on main.
  const artifact: Artifact = { id: `${id}-live-log`, name: 'live-run.log', type: 'log', size: 0, updatedAt: new Date(0).toISOString() };
  const events: RunStreamPayload[] = [
    { type: 'RUN_STATUS', status: 'running', metrics: { seedCount: run.seedCount + 128, duration: run.duration + 1000 } },
    { type: 'LOG_APPEND', entries: [{ id: `${id}-live-1`, timestamp: 1, level: 'info', source: 'stream', message: 'Live campaign checkpoint received' }] },
    { type: 'ARTIFACT_ADDED', artifact },
    { type: 'RUN_STATUS', status: run.status, metrics: { seedCount: run.seedCount, duration: run.duration } },
  ];
  let sequence = after;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RunStreamPayload) => {
        if (closed) return;
        sequence += 1;
        controller.enqueue(frame({ seq: sequence, runId: id, event }));
      };
      events.slice(after).forEach(send);
      heartbeatTimer = setInterval(() => send({ type: 'HEARTBEAT', at: new Date().toISOString() }), 15_000);
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}