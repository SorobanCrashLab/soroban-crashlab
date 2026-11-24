// WIP scaffold for issue #2271. Retry/DLQ metrics not implemented yet.
"use client";

export function QueueWorkerPanel({
  queueDepth,
  workerThroughputPerMin,
}: {
  queueDepth: number;
  workerThroughputPerMin: number;
}) {
  return (
    <section aria-label="Queue and worker status" className="queue-worker-panel">
      <p>Queue depth: {queueDepth}</p>
      <p>Worker throughput: {workerThroughputPerMin}/min</p>
    </section>
  );
}
