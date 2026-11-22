// WIP scaffold for issue #2271. Error-budget calculation not implemented yet.
"use client";

export interface SloMetric {
  name: string;
  target: number;
  current: number;
}

export function SLOPanel({ metrics }: { metrics: SloMetric[] }) {
  return (
    <section aria-label="SLO status" className="slo-panel">
      {metrics.map((metric) => (
        <div key={metric.name}>
          {metric.name}: {metric.current} / target {metric.target}
        </div>
      ))}
    </section>
  );
}
