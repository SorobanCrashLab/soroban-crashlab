'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RunStatus } from '../../types';
import { isTerminalStatus } from '../../../lib/run-status';
import { useRunStream } from './useRunStream';

const POLL_INTERVAL_MS = 5_000;

interface RunDetailAutoRefreshProps {
  runId: string;
  initialStatus: RunStatus;
}

export default function RunDetailAutoRefresh({ runId, initialStatus }: RunDetailAutoRefreshProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RunStatus>(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useRunStream(runId, (envelope) => {
    if (envelope.event.type === 'RUN_STATUS') {
      setStatus(envelope.event.status);
      router.refresh();
    }
  });

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
            setStatus(data.data.status);
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
    <span className={`badge badge-${status}`}>
      {status}
      {!isTerminalStatus(status) && (
        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
    </span>
  );
}
