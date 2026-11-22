// WIP scaffold for issue #2280. TODO: fetch real data from /api/perf-metrics/summary.
"use client";

import { useState } from "react";

export interface RouteVitals {
  route: string;
  lcpP75: number;
  clsP75: number;
}

export function usePerfMetrics() {
  const [routes, setRoutes] = useState<RouteVitals[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return { routes, setRoutes, isLoading, setIsLoading };
}
