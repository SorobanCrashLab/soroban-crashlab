// WIP scaffold for issue #2280. Static thresholds only; no release/time-window regression
// comparison yet.

export interface PerfBudget {
  metric: "LCP" | "CLS";
  route: string;
  threshold: number;
}

const DEFAULT_BUDGETS: readonly PerfBudget[] = [
  { metric: "LCP", route: "*", threshold: 2500 },
  { metric: "CLS", route: "*", threshold: 0.1 },
];

export function checkBudget(metric: "LCP" | "CLS", value: number, route: string): boolean {
  const budget =
    DEFAULT_BUDGETS.find((entry) => entry.metric === metric && entry.route === route) ??
    DEFAULT_BUDGETS.find((entry) => entry.metric === metric && entry.route === "*");
  return budget ? value <= budget.threshold : true;
}
