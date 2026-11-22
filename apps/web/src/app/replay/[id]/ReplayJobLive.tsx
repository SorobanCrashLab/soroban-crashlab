'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live progress for an in-flight replay (#1876). Subscribes to the job's SSE
 * stream and refreshes the server component when the job reaches a terminal
 * state. The bar starts from the server-rendered percentage so there is no
 * visual jump on mount.
 */
export default function ReplayJobLive({
  jobId,
  initialPercent,
}: {
  jobId: string;
  initialPercent: number;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(initialPercent);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/replay-jobs/${encodeURIComponent(jobId)}/stream`);

    const onReplay = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { percent?: unknown };
        if (typeof payload.percent === 'number') setPercent(payload.percent);
      } catch {
        // A malformed frame is ignored; the next frame carries the same state.
      }
    };

    const onDone = () => {
      source.close();
      router.refresh();
    };

    source.addEventListener('replay', onReplay as EventListener);
    source.addEventListener('done', onDone);
    source.onerror = () => {
      // EventSource retries on its own; surface "reconnecting" instead of
      // pretending the replay stopped.
      setDisconnected(true);
    };

    return () => {
      source.removeEventListener('replay', onReplay as EventListener);
      source.removeEventListener('done', onDone);
      source.close();
    };
  }, [jobId, router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
      {disconnected ? `reconnecting · ${percent}%` : `live · ${percent}%`}
    </span>
  );
}
