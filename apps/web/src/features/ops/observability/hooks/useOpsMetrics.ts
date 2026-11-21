// WIP scaffold for issue #2271 (Observability & Operations Dashboard). TODO: replace with
// real data fetching + SSE/polling from /api/ops/*.
"use client";

import { useState } from "react";

export interface OpsSnapshot {
  serviceHealth: Array<{ name: string; status: "healthy" | "degraded" | "down" }>;
  queueDepth: number;
  workerThroughputPerMin: number;
}

export function useOpsMetrics() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot>({
    serviceHealth: [],
    queueDepth: 0,
    workerThroughputPerMin: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  return { snapshot, setSnapshot, isLoading, setIsLoading };
}
