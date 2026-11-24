// WIP scaffold for issue #2271. Trend charts not implemented yet.
"use client";

export interface IntegrationHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
}

export function IntegrationHealthPanel({ integrations }: { integrations: IntegrationHealth[] }) {
  return (
    <section aria-label="Integration health" className="integration-health-panel">
      {integrations.map((integration) => (
        <div key={integration.name}>
          {integration.name}: {integration.status}
        </div>
      ))}
    </section>
  );
}
