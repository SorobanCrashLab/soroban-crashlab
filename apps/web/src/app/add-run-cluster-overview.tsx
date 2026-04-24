"use client";

import React, { useMemo } from "react";
import { FuzzingRun, RunArea } from "./types";

export type RunClusterOverviewDataState = "loading" | "error" | "success";

interface RunClusterOverviewProps {
  runs: FuzzingRun[];
  dataState?: RunClusterOverviewDataState;
  onRetry?: () => void;
  errorMessage?: string;
}

export interface ClusterStats {
  area: RunArea;
  total: number;
  failed: number;
  running: number;
  completed: number;
  avgCpu: number;
  criticalIssues: number;
  healthScore: number;
}

export function computeClusterStats(runs: FuzzingRun[]): ClusterStats[] {
  const areas: RunArea[] = ["auth", "state", "budget", "xdr"];

  return areas.map((area) => {
    const areaRuns = runs.filter((r) => r.area === area);
    const total = areaRuns.length;
    const failed = areaRuns.filter((r) => r.status === "failed").length;
    const running = areaRuns.filter((r) => r.status === "running").length;
    const completed = areaRuns.filter((r) => r.status === "completed").length;

    const avgCpu =
      total > 0
        ? Math.round(
            areaRuns.reduce((acc, r) => acc + r.cpuInstructions, 0) / total,
          )
        : 0;

    const criticalIssues = areaRuns.filter(
      (r) => r.severity === "critical",
    ).length;

    const healthScore =
      total > 0 ? Math.round(((completed + running * 0.5) / total) * 100) : 100;

    return {
      area,
      total,
      failed,
      running,
      completed,
      avgCpu,
      criticalIssues,
      healthScore,
    };
  });
}

const AREA_CONFIG: Record<
  RunArea,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  auth: {
    label: "Authentication",
    description: "Access control and identity verification",
    color: "indigo",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  state: {
    label: "State Management",
    description: "Contract storage and state transitions",
    color: "emerald",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
        />
      </svg>
    ),
  },
  budget: {
    label: "Budgeting & Fees",
    description: "Resource consumption and fee limits",
    color: "amber",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  xdr: {
    label: "XDR Serialization",
    description: "Data encoding and decoding protocols",
    color: "rose",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
        />
      </svg>
    ),
  },
};

const COLOR_CLASSES: Record<
  string,
  { topBar: string; icon: string; healthText: string }
> = {
  indigo: {
    topBar: "from-indigo-500 to-indigo-300",
    icon: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
    healthText: "text-indigo-600 dark:text-indigo-400",
  },
  emerald: {
    topBar: "from-emerald-500 to-emerald-300",
    icon: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    healthText: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    topBar: "from-amber-500 to-amber-300",
    icon: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    healthText: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    topBar: "from-rose-500 to-rose-300",
    icon: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
    healthText: "text-rose-600 dark:text-rose-400",
  },
};

const HEALTH_COLORS = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
};

export function getHealthColor(score: number): string {
  const colorKey = score > 80 ? "emerald" : score > 50 ? "amber" : "rose";
  return HEALTH_COLORS[colorKey];
}

export function computeOverallHealth(stats: ClusterStats[]): number {
  const totalRuns = stats.reduce((sum, cluster) => sum + cluster.total, 0);
  if (totalRuns === 0) {
    return 100;
  }

  const weightedScore = stats.reduce(
    (sum, cluster) => sum + cluster.healthScore * cluster.total,
    0,
  );

  return Math.round(weightedScore / totalRuns);
}

export interface ClusterRiskInsight {
  area: RunArea;
  heading: string;
  description: string;
  failureRate: number;
}

export function buildClusterRiskInsight(
  stats: ClusterStats[],
): ClusterRiskInsight | null {
  const riskyClusters = stats
    .filter((cluster) => cluster.total > 0)
    .map((cluster) => ({
      cluster,
      failureRate: cluster.failed / cluster.total,
    }))
    .sort(
      (a, b) =>
        b.failureRate - a.failureRate ||
        b.cluster.criticalIssues - a.cluster.criticalIssues,
    );

  const topRisk = riskyClusters[0];
  if (!topRisk || topRisk.failureRate === 0) {
    return null;
  }

  const clusterLabel = AREA_CONFIG[topRisk.cluster.area].label;
  const failurePercent = Math.round(topRisk.failureRate * 100);
  const criticalIssuesLabel =
    topRisk.cluster.criticalIssues > 0
      ? `${topRisk.cluster.criticalIssues} critical issue${topRisk.cluster.criticalIssues === 1 ? "" : "s"} detected.`
      : "No critical issues detected yet.";

  return {
    area: topRisk.cluster.area,
    heading: `${clusterLabel} requires triage focus`,
    description: `${failurePercent}% of ${clusterLabel} runs are failing. ${criticalIssuesLabel}`,
    failureRate: topRisk.failureRate,
  };
}

const RunClusterOverview: React.FC<RunClusterOverviewProps> = ({
  runs,
  dataState = "success",
  onRetry,
  errorMessage,
}) => {
  const clusterStats = useMemo(() => computeClusterStats(runs), [runs]);
  const overallHealth = useMemo(
    () => computeOverallHealth(clusterStats),
    [clusterStats],
  );
  const riskInsight = useMemo(
    () => buildClusterRiskInsight(clusterStats),
    [clusterStats],
  );

  if (dataState === "loading") {
    return (
      <section
        className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        aria-busy="true"
        aria-label="Cluster Health Overview loading"
      >
        <div className="h-8 w-56 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30"
            />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === "error") {
    return (
      <section className="w-full rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100">
          Cluster Health Overview
        </h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          {errorMessage ??
            "Cluster overview is unavailable. Retry to refresh cluster diagnostics."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry cluster overview
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="w-full space-y-6" aria-label="Cluster Health Overview">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Cluster Health Overview
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Real-time diagnostics and health scoring across all fuzzer focus
            areas.
          </p>
        </div>
        <div className="flex gap-4">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              overallHealth > 80
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : overallHealth > 50
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                overallHealth > 80
                  ? "bg-emerald-500"
                  : overallHealth > 50
                    ? "bg-amber-500"
                    : "bg-rose-500"
              } ${overallHealth > 50 ? "animate-pulse" : ""}`}
            />
            Overall health {overallHealth}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {clusterStats.map((stats) => {
          const config = AREA_CONFIG[stats.area];
          const healthColorClass = getHealthColor(stats.healthScore);
          const styleConfig = COLOR_CLASSES[config.color];

          return (
            <article
              key={stats.area}
              tabIndex={0}
              aria-label={`${config.label} cluster card`}
              className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div
                className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${styleConfig.topBar}`}
              />

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${styleConfig.icon}`}>
                    {config.icon}
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${healthColorClass}`}>
                      {stats.healthScore}%
                    </span>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                      Health Index
                    </p>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                  {config.label}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                  {config.description}
                </p>

                <div className="space-y-4">
                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                      <span>Coverage Status</span>
                      <span>{stats.total} total runs</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%`,
                        }}
                        title="Completed"
                        aria-label={`Completed ${stats.completed} runs`}
                      />
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{
                          width: `${stats.total > 0 ? (stats.running / stats.total) * 100 : 0}%`,
                        }}
                        title="Running"
                        aria-label={`Running ${stats.running} runs`}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all duration-500"
                        style={{
                          width: `${stats.total > 0 ? (stats.failed / stats.total) * 100 : 0}%`,
                        }}
                        title="Failed"
                        aria-label={`Failed ${stats.failed} runs`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">
                        Avg CPU
                      </p>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {stats.avgCpu.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">
                        Criticals
                      </p>
                      <p
                        className={`text-sm font-semibold ${stats.criticalIssues > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100"}`}
                      >
                        {stats.criticalIssues}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-6 py-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-800/50 dark:bg-zinc-900/50">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  View detailed metrics
                </span>
                <svg
                  className="w-4 h-4 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </article>
          );
        })}
      </div>

      {/* High-level system insight */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">
              Cross-Cluster Predictive Risk
            </h3>
            <p className="text-indigo-100 text-sm leading-relaxed max-w-2xl">
              {riskInsight
                ? `${riskInsight.heading}. ${riskInsight.description}`
                : "No elevated cluster risk detected yet. Continue monitoring run health trends as new executions complete."}
            </p>
          </div>
          <button
            type="button"
            className="px-6 py-2.5 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!riskInsight}
          >
            {riskInsight ? "Analyze Risk vectors" : "No risk vectors yet"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RunClusterOverview;
