"use client";

import React, { useMemo, useState, useCallback } from "react";
import { FuzzingRun } from "./types";

export type CrossRunBoardDataState = "loading" | "error" | "success";

interface CrossRunBoardWidgetsProps {
  runs?: FuzzingRun[];
  dataState?: CrossRunBoardDataState;
  onRetry?: () => void;
  errorMessage?: string;
  className?: string;
}

interface Widget {
  id: string;
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  color: "blue" | "purple" | "green" | "amber";
  description: string;
  icon: React.ReactNode;
}

interface WidgetMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  cancelledRuns: number;
  avgDuration: number;
  avgSeeds: number;
  criticalIssues: number;
  successRate: number;
}

/**
 * Computes comprehensive metrics from fuzzing runs data
 */
export function computeWidgetMetrics(runs: FuzzingRun[]): WidgetMetrics {
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const runningRuns = runs.filter((r) => r.status === "running").length;
  const cancelledRuns = runs.filter((r) => r.status === "cancelled").length;
  
  const avgDuration = totalRuns > 0
    ? runs.reduce((acc, r) => acc + r.duration, 0) / totalRuns
    : 0;
    
  const avgSeeds = totalRuns > 0
    ? runs.reduce((acc, r) => acc + r.seedCount, 0) / totalRuns
    : 0;
    
  const criticalIssues = runs.filter((r) => r.severity === "critical").length;
  
  const successRate = totalRuns > 0
    ? (completedRuns / totalRuns) * 100
    : 0;

  return {
    totalRuns,
    completedRuns,
    failedRuns,
    runningRuns,
    cancelledRuns,
    avgDuration,
    avgSeeds,
    criticalIssues,
    successRate,
  };
}

/**
 * Loading skeleton component for widgets
 */
const WidgetSkeleton: React.FC = () => (
  <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 animate-pulse">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
      <div className="h-4 w-20 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
    </div>
    <div className="flex items-end justify-between">
      <div className="h-8 w-16 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
      <div className="h-4 w-12 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
    </div>
  </div>
);

/**
 * Error state component for widgets
 */
const WidgetError: React.FC<{ onRetry?: () => void; errorMessage?: string }> = ({ 
  onRetry, 
  errorMessage = "Failed to load widget data" 
}) => (
  <div className="rounded-xl p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
    <div className="flex items-center gap-2 mb-3">
      <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm font-medium text-red-700 dark:text-red-300">Error</span>
    </div>
    <p className="text-xs text-red-600 dark:text-red-400 mb-3">{errorMessage}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/70 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-red-900"
      >
        Retry
      </button>
    )}
  </div>
);

const CrossRunBoardWidgets: React.FC<CrossRunBoardWidgetsProps> = ({ 
  runs = [], 
  dataState = "success",
  onRetry,
  errorMessage,
  className = ""
}) => {
  const [focusedWidget, setFocusedWidget] = useState<string | null>(null);

  const metrics = useMemo(() => computeWidgetMetrics(runs), [runs]);

  const widgets = useMemo<Widget[]>(() => {
    const { 
      totalRuns, 
      completedRuns, 
      failedRuns, 
      runningRuns, 
      avgDuration, 
      avgSeeds,
      criticalIssues,
      successRate 
    } = metrics;

    return [
      {
        id: "total-runs",
        title: "Total Runs",
        value: totalRuns,
        color: "blue" as const,
        description: `${totalRuns} fuzzing runs across all areas`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        id: "completed",
        title: "Completed",
        value: completedRuns,
        change: totalRuns > 0 ? `${Math.round(successRate)}%` : undefined,
        trend: successRate >= 80 ? "up" : successRate >= 60 ? "neutral" : "down",
        color: "green" as const,
        description: `${completedRuns} runs completed successfully (${Math.round(successRate)}% success rate)`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: "failed",
        title: "Failed",
        value: failedRuns,
        change: totalRuns > 0 ? `${Math.round((failedRuns / totalRuns) * 100)}%` : undefined,
        trend: failedRuns > totalRuns * 0.2 ? "down" : failedRuns > totalRuns * 0.1 ? "neutral" : "up",
        color: "amber" as const,
        description: `${failedRuns} runs failed${criticalIssues > 0 ? `, ${criticalIssues} critical` : ''}`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: "running",
        title: "Running",
        value: runningRuns,
        color: "purple" as const,
        description: `${runningRuns} runs currently in progress`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10v4a2 2 0 002 2h2a2 2 0 002-2v-4M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1" />
          </svg>
        ),
      },
      {
        id: "avg-duration",
        title: "Avg Duration",
        value: totalRuns > 0 ? `${Math.round(avgDuration / 60000)}m` : "—",
        color: "blue" as const,
        description: `Average run duration: ${totalRuns > 0 ? Math.round(avgDuration / 60000) : 0} minutes`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: "avg-seeds",
        title: "Avg Seeds",
        value: totalRuns > 0 ? Math.round(avgSeeds).toLocaleString() : "—",
        color: "green" as const,
        description: `Average seeds per run: ${totalRuns > 0 ? Math.round(avgSeeds).toLocaleString() : 0}`,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM7 3H5a2 2 0 00-2 2v12a4 4 0 004 4h2a2 2 0 002-2V5a2 2 0 00-2-2z" />
          </svg>
        ),
      },
    ];
  }, [metrics]);

  const colorClasses = {
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  };

  const trendIcons = {
    up: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
      </svg>
    ),
    down: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
      </svg>
    ),
    neutral: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    ),
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent, widgetId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFocusedWidget(focusedWidget === widgetId ? null : widgetId);
    }
  }, [focusedWidget]);

  // Loading state
  if (dataState === "loading") {
    return (
      <section 
        className={`cross-run-board-widgets ${className}`} 
        aria-label="Loading cross-run statistics"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-6 h-6 bg-zinc-300 dark:bg-zinc-700 rounded animate-pulse"></div>
          <div className="h-8 w-48 bg-zinc-300 dark:bg-zinc-700 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <WidgetSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (dataState === "error") {
    return (
      <section 
        className={`cross-run-board-widgets ${className}`} 
        aria-label="Cross-run statistics error"
      >
        <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">Cross-run Board</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <WidgetError key={i} onRetry={onRetry} errorMessage={errorMessage} />
          ))}
        </div>
      </section>
    );
  }

  // Success state
  return (
    <section 
      className={`cross-run-board-widgets ${className}`} 
      aria-label="Cross-run statistics dashboard"
    >
      <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">Cross-run Board</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            role="button"
            tabIndex={0}
            className={`rounded-xl p-4 border ${colorClasses[widget.color]} transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 cursor-pointer`}
            onKeyDown={(e) => handleKeyDown(e, widget.id)}
            onClick={() => setFocusedWidget(focusedWidget === widget.id ? null : widget.id)}
            aria-expanded={focusedWidget === widget.id}
            aria-describedby={`widget-${widget.id}-description`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="opacity-80" aria-hidden="true">
                {widget.icon}
              </span>
              <p className="text-sm font-medium opacity-80">{widget.title}</p>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-bold" aria-label={`${widget.title}: ${widget.value}`}>
                {widget.value}
              </p>
              {widget.change && (
                <span className="flex items-center gap-1 text-xs font-medium">
                  <span aria-hidden="true">{trendIcons[widget.trend!]}</span>
                  <span>{widget.change}</span>
                </span>
              )}
            </div>
            {focusedWidget === widget.id && (
              <div 
                id={`widget-${widget.id}-description`}
                className="mt-3 pt-3 border-t border-current/20 text-xs opacity-80"
                role="tooltip"
              >
                {widget.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default CrossRunBoardWidgets;
