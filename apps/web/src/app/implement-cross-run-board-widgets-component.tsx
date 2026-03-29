import React, { useMemo } from "react";
import { FuzzingRun } from "./types";

interface CrossRunBoardWidgetsProps {
  runs?: FuzzingRun[];
}

interface Widget {
  id: string;
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  color: "blue" | "purple" | "green" | "amber";
}

const CrossRunBoardWidgets: React.FC<CrossRunBoardWidgetsProps> = ({ runs = [] }) => {
  const widgets = useMemo<Widget[]>(() => {
    const totalRuns = runs.length || 25;
    const completedRuns = runs.filter((r) => r.status === "completed").length || Math.floor(totalRuns * 0.6);
    const failedRuns = runs.filter((r) => r.status === "failed").length || Math.floor(totalRuns * 0.15);
    const runningRuns = runs.filter((r) => r.status === "running").length || Math.floor(totalRuns * 0.1);
    const avgDuration = runs.length
      ? runs.reduce((acc, r) => acc + r.duration, 0) / runs.length
      : 450000;

    return [
      {
        id: "total-runs",
        title: "Total Runs",
        value: totalRuns,
        color: "blue" as const,
      },
      {
        id: "completed",
        title: "Completed",
        value: completedRuns,
        change: `${Math.round((completedRuns / totalRuns) * 100)}%`,
        trend: "up" as const,
        color: "green" as const,
      },
      {
        id: "failed",
        title: "Failed",
        value: failedRuns,
        change: `${Math.round((failedRuns / totalRuns) * 100)}%`,
        trend: failedRuns > 5 ? "down" as const : "neutral" as const,
        color: "amber" as const,
      },
      {
        id: "running",
        title: "Running",
        value: runningRuns,
        color: "purple" as const,
      },
      {
        id: "avg-duration",
        title: "Avg Duration",
        value: `${Math.round(avgDuration / 60000)}m`,
        color: "blue" as const,
      },
    ];
  }, [runs]);

  const colorClasses = {
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  };

  const trendIcons = {
    up: "↑",
    down: "↓",
    neutral: "→",
  };

  return (
    <section className="cross-run-board-widgets" aria-label="Cross-run statistics">
      <h2 className="text-2xl font-bold mb-6">Cross-run Board</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className={`rounded-xl p-4 border ${colorClasses[widget.color]} transition hover:shadow-md`}
          >
            <p className="text-sm font-medium opacity-80 mb-1">{widget.title}</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold">{widget.value}</p>
              {widget.change && (
                <span className="text-xs font-medium">
                  {trendIcons[widget.trend!]} {widget.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CrossRunBoardWidgets;
