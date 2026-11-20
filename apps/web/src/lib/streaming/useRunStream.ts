'use client';

/**
 * Enhanced useRunStream hook for global run stream (#2191).
 *
 * Uses the RunEventStream class with SSE/WS/polling fallback chain.
 * Manages connection lifecycle (connect on mount, close on unmount).
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { RunEventStream } from './RunEventStream';
import type { ConnectionHealth } from './connectionManager';
import type { AllEventTypes, StreamEnvelope } from './eventTypes';

export interface GlobalRunStreamState {
  connected: boolean;
  health: ConnectionHealth;
  lastEvent: StreamEnvelope | null;
  events: StreamEnvelope[];
  reconnect: () => void;
}

export function useGlobalRunStream(options?: {
  campaignId?: string;
  runId?: string;
  maxEvents?: number;
}): GlobalRunStreamState {
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<ConnectionHealth>('disconnected');
  const [lastEvent, setLastEvent] = useState<StreamEnvelope | null>(null);
  const [events, setEvents] = useState<StreamEnvelope[]>([]);
  const streamRef = useRef<RunEventStream | null>(null);
  const maxEvents = options?.maxEvents ?? 100;

  const handleEvent = useCallback(
    (envelope: StreamEnvelope) => {
      setLastEvent(envelope);
      setEvents((prev) => {
        const next = [...prev, envelope];
        return next.length > maxEvents ? next.slice(-maxEvents) : next;
      });
    },
    [maxEvents],
  );

  useEffect(() => {
    const stream = new RunEventStream(options?.runId, { campaignId: options?.campaignId });
    streamRef.current = stream;

    const unsubHealth = stream.onHealth((h) => {
      setHealth(h);
      setConnected(h === 'connected');
    });

    // Subscribe to all event types
    const eventTypes = [
      'run.created',
      'run.status_changed',
      'run.metrics_updated',
      'run.crashed',
      'run.completed',
      'artifact.uploaded',
    ] as const;

    for (const type of eventTypes) {
      stream.on(type, handleEvent);
    }

    stream.connect();

    return () => {
      unsubHealth();
      stream.close();
      streamRef.current = null;
    };
  }, [options?.campaignId, options?.runId]);

  const reconnect = useCallback(() => {
    streamRef.current?.connect();
  }, []);

  return { connected, health, lastEvent, events, reconnect };
}
