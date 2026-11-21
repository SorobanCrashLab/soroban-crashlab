// WIP scaffold for issue #2271. Drill-down links to logs/traces not implemented yet.
"use client";

import type { OpsSnapshot } from "../hooks/useOpsMetrics";

export function ServiceHealthPanel({ services }: { services: OpsSnapshot["serviceHealth"] }) {
  return (
    <section aria-label="Service health" className="service-health-panel">
      {services.map((service) => (
        <div key={service.name}>
          {service.name}: {service.status}
        </div>
      ))}
    </section>
  );
}
