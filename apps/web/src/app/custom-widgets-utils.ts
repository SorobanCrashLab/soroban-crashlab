import { FuzzingRun } from "./types";
import { countByStatus, avgDuration, avgSeeds } from "./run-metrics";

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
  if (n === 0 && metric !== "total-runs") return "—";
  const counts = countByStatus(runs);
  switch (metric) {
    case "total-runs": return String(n);
    case "completed": return String(counts.completed);
    case "failed": return String(counts.failed);
    case "running": return String(counts.running);
    case "avg-duration": return `${Math.round(avgDuration(runs) / 60000)}m`;
    case "avg-seeds": return String(Math.round(avgSeeds(runs)));
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
