// WIP scaffold for issue #2280. Percentile charts / heatmap not implemented yet — plain
// table of p75 values only.
"use client";

import type { RouteVitals } from "./hooks/usePerfMetrics";

export function RouteVitalsTable({ routes }: { routes: RouteVitals[] }) {
  return (
    <table aria-label="Route web vitals" className="route-vitals-table">
      <thead>
        <tr>
          <th>Route</th>
          <th>LCP p75</th>
          <th>CLS p75</th>
        </tr>
      </thead>
      <tbody>
        {routes.map((route) => (
          <tr key={route.route}>
            <td>{route.route}</td>
            <td>{route.lcpP75}ms</td>
            <td>{route.clsP75}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
