'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RunStatus } from '../../types';
import { isTerminalStatus } from '../../../lib/run-status';
import { useRunStream } from './useRunStream';
import {
  runStreamAnnouncement,
  streamConnectionAnnouncement,
} from './run-stream-announcement';

const POLL_INTERVAL_MS = 5_000;

interface RunDetailAutoRefreshProps {
  runId: string;
  initialStatus: RunStatus;
}

export default function RunDetailAutoRefresh({ runId, initialStatus }: RunDetailAutoRefreshProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RunStatus>(initialStatus);
  const [announcement, setAnnouncement] = useState('');
  const statusRef = useRef<RunStatus>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const announce = useCallback((message: string | null) => {
    if (message) setAnnouncement(message);
  }, []);

  const stream = useRunStream(runId, (envelope) => {
    if (envelope.event.type === 'RUN_STATUS' || envelope.event.type === 'STATIC') {
      const nextStatus = envelope.event.status;
      const message = runStreamAnnouncement(envelope.event, statusRef.current);
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      announce(message);
      router.refresh();
    } else {
      announce(runStreamAnnouncement(envelope.event));
    }
  });

  // Announce connection changes so a silent SSE drop is still perceivable.
  const connectedRef = useRef(stream.connected);
  useEffect(() => {
    const message = streamConnectionAnnouncement(connectedRef.current, stream.connected);
    connectedRef.current = stream.connected;
    announce(message);
  }, [announce, stream.connected]);

  useEffect(() => {
    if (isTerminalStatus(status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { data?: { status?: RunStatus } };
          if (data.data?.status && data.data.status !== status) {
            statusRef.current = data.data.status;
            setStatus(data.data.status);
            setAnnouncement(`Run status changed to ${data.data.status}.`);
            router.refresh();
          }
        }
      } catch {
        // Silently ignore fetch errors during polling
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runId, status, router]);

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`badge badge-${status}`}>
        {status}
        {!isTerminalStatus(status) && (
          <span
            className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse"
            aria-hidden="true"
          />
        )}
      </span>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="run-stream-announcer"
      >
        {announcement}
      </span>
    </span>
  );
}
