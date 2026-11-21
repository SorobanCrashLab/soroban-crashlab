// WIP scaffold for issue #2280 (Performance Observability & Web Vitals). The `web-vitals`
// package is not a project dependency, so this uses PerformanceObserver directly and only
// covers LCP and CLS so far — INP, FCP, and TTFB are not implemented yet.
"use client";

export interface VitalMetric {
  name: "LCP" | "CLS";
  value: number;
  route: string;
}

export function observeVitals(onMetric: (metric: VitalMetric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") {
    return () => undefined;
  }

  const route = window.location.pathname;
  const observers: PerformanceObserver[] = [];

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        onMetric({ name: "LCP", value: last.startTime, route });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(lcpObserver);
  } catch {
    // unsupported in this browser
  }

  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          onMetric({ name: "CLS", value: clsValue, route });
        }
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
    observers.push(clsObserver);
  } catch {
    // unsupported in this browser
  }

  return () => {
    for (const observer of observers) observer.disconnect();
  };
}
