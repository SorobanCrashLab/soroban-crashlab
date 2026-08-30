'use client';

import { useEffect, useRef, useState } from 'react';
import type { RunStreamEnvelope, RunStreamPayload } from '@/lib/run-stream';

const INITIAL_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 10_000;
const EVENT_TYPES = ['RUN_STATUS', 'LOG_APPEND', 'ARTIFACT_ADDED', 'HEARTBEAT'] as const;

export interface RunStreamState {
  connected: boolean;
  lastSeq: number;
  lastEvent: RunStreamEnvelope | null;
}

export function useRunStream(runId: string, onEvent?: (event: RunStreamEnvelope) => void): RunStreamState {
  const [state, setState] = useState<RunStreamState>({ connected: false, lastSeq: 0, lastEvent: null });
  const lastSeqRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let disposed = false;
    let reconnectMs = INITIAL_RECONNECT_MS;

    const connect = () => {
      if (disposed) return;
      const query = lastSeqRef.current > 0 ? `?after=${lastSeqRef.current}` : '';
      const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream${query}`);
      eventSourceRef.current = source;
      source.onopen = () => {
        reconnectMs = INITIAL_RECONNECT_MS;
        setState((current) => ({ ...current, connected: true }));
      };
      const handleMessage = (message: MessageEvent<string>) => {
        try {
          const envelope = JSON.parse(message.data) as RunStreamEnvelope<RunStreamPayload>;
          if (envelope.seq <= lastSeqRef.current) return;
          lastSeqRef.current = envelope.seq;
          setState({ connected: true, lastSeq: envelope.seq, lastEvent: envelope });
          onEventRef.current?.(envelope);
        } catch {
          // Ignore malformed events and keep the stream alive.
        }
      };
      EVENT_TYPES.forEach((eventType) => source.addEventListener(eventType, handleMessage));
      removeListenersRef.current = () => {
        EVENT_TYPES.forEach((eventType) => source.removeEventListener(eventType, handleMessage));
      };
      source.onerror = () => {
        removeListenersRef.current?.();
        removeListenersRef.current = null;
        source.close();
        eventSourceRef.current = null;
        if (disposed) return;
        setState((current) => ({ ...current, connected: false }));
        reconnectTimerRef.current = setTimeout(connect, reconnectMs);
        reconnectMs = Math.min(reconnectMs * 2, MAX_RECONNECT_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      removeListenersRef.current?.();
      removeListenersRef.current = null;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [runId]);

  return state;
}