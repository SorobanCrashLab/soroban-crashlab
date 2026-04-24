import { FuzzingRun } from "./types";

export type WidgetMetric = "total-runs" | "completed" | "failed" | "running" | "avg-duration" | "avg-seeds";
export type WidgetColor = "blue" | "purple" | "green" | "amber";

export interface CustomWidget {
  id: string;
  metric: WidgetMetric;
  label: string;
  color: WidgetColor;
}

export function computeMetric(metric: WidgetMetric, runs: FuzzingRun[]): string {
  const n = runs.length;
  switch (metric) {
    case "total-runs": return String(n);
    case "completed": return String(runs.filter((r) => r.status === "completed").length);
    case "failed": return String(runs.filter((r) => r.status === "failed").length);
    case "running": return String(runs.filter((r) => r.status === "running").length);
    case "avg-duration": return n ? `${Math.round(runs.reduce((s, r) => s + r.duration, 0) / n / 60000)}m` : "—";
    case "avg-seeds": return n ? String(Math.round(runs.reduce((s, r) => s + r.seedCount, 0) / n)) : "—";
    default: return "—";
  }
}

export function reorderWidgets(widgets: CustomWidget[], fromIdx: number, toIdx: number): CustomWidget[] {
  if (fromIdx < 0 || fromIdx >= widgets.length || toIdx < 0 || toIdx >= widgets.length) {
    return widgets;
  }
  const next = [...widgets];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}
