// WIP scaffold for issue #2280. Sends raw metric payloads to the (also stubbed) perf-metrics
// endpoint; no batching, retry, or PII scrubbing yet.
"use client";

import { shouldSample } from "./sampling";
import type { VitalMetric } from "./vitals";

export function reportVital(metric: VitalMetric, sampleRate = 1): void {
  if (!shouldSample(sampleRate)) return;

  void fetch("/api/perf-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metric),
    keepalive: true,
  }).catch(() => {
    // best-effort; metric loss is acceptable for this scaffold
  });
}
