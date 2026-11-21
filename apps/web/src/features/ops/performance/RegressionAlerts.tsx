// WIP scaffold for issue #2280. Release/time-window regression comparison not implemented
// yet — see apps/web/src/lib/perf/budgets.ts for the current static-threshold check.
"use client";

import { checkBudget } from "@/lib/perf/budgets";
import type { RouteVitals } from "./hooks/usePerfMetrics";

export function RegressionAlerts({ routes }: { routes: RouteVitals[] }) {
  const breaches = routes.filter((route) => !checkBudget("LCP", route.lcpP75, route.route));

  if (breaches.length === 0) {
    return <p role="status">No budget breaches detected.</p>;
  }

  return (
    <ul aria-label="Performance budget breaches" role="alert">
      {breaches.map((route) => (
        <li key={route.route}>
          {route.route}: LCP p75 {route.lcpP75}ms exceeds budget
        </li>
      ))}
    </ul>
  );
}
