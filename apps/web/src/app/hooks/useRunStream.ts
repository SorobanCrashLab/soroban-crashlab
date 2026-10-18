'use client';

import { useEffect, useRef } from 'react';
import type { RunStreamEnvelope } from '@/lib/run-stream';

type RunStreamEvent = RunStreamEnvelope['event'];

export interface UseRunStreamOptions {
  runId: string;
  onStatus?: (envelope: RunStreamEnvelope) => void;
  onLagging?: (dropped: number) => void;
  enabled?: boolean;
}

/**
 * Minimal client hook consuming the run SSE stream. It relies on the
 * browser's EventSource automatic reconnect + Last-Event-ID handling:
 * the server sets `id:` on every event, and the browser sends it back
 * as `Last-Event-ID` on reconnect, so the server replays the missed
 * events. Full UI rework is tracked separately (W5-H01).
 */
export function useRunStream(options: UseRunStreamOptions): void {
  const { runId, onStatus, onLagging, enabled = true } = options;
  const callbacks = useRef({ onStatus, onLagging });

  useEffect(() => {
    callbacks.current = { onStatus, onLagging };
  }, [onStatus, onLagging]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined;

    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);

    const handleMessage = (event: MessageEvent) => {
      try {
        const envelope = JSON.parse(event.data) as RunStreamEnvelope;
        const streamEvent: RunStreamEvent = envelope.event;
        if (streamEvent.type === 'LAGGING') {
          callbacks.current.onLagging?.(streamEvent.dropped);
          return;
        }
        if (streamEvent.type === 'HEARTBEAT') {
          return;
        }
        callbacks.current.onStatus?.(envelope);
      } catch {
        // Ignore malformed frames; the browser will reconnect and
        // replay from the last good event id.
      }
    };

    source.addEventListener('message', handleMessage as EventListener);

    return () => {
      source.removeEventListener('message', handleMessage as EventListener);
      source.close();
    };
  }, [enabled, runId]);
}
