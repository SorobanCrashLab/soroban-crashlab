import { FuzzingRun, RunArea, RunSeverity } from "./types";
import { RUN_STATUSES, STATUS_META } from "../lib/run-status";
import { buildFailureClusters } from "./failureClusters";

/**
 * Grouping mode for the run-cluster visualization.
 */
export type ClusterMode =
  | "status"
  | "area"
  | "severity"
  | "performance"
  | "failure";

export interface RunCluster {
  id: string;
  label: string;
  runs: FuzzingRun[];
  color: string;
  icon: string;
  avgDuration?: number;
  avgCpuInstructions?: number;
  avgMemoryBytes?: number;
  failureRate?: number;
}

/**
 * Represents cluster metrics for performance analysis.
 */
export interface ClusterMetrics {
  totalRuns: number;
  avgDuration: number;
  avgCpuInstructions: number;
  avgMemoryBytes: number;
  failureRate: number;
  throughput: number;
}

/** Sort keys supported by {@link sortClustersBy}. */
export type ClusterSortKey = "count" | "duration" | "failure-rate";

/**
 * View mode rendered inside the cluster visualization canvas.
 */
export type ViewMode = "grid" | "bubbles" | "timeline" | "metrics";

/**
 * Tailwind class groups used to theme a cluster across the visualization.
 */
export interface ClusterColorClasses {
  bg: string;
  border: string;
  text: string;
  gradient: string;
}

/**
 * Color theme lookup used by every cluster visualization surface (cards,
 * bubbles, legend, timeline, metrics and details panels).
 */
export const colorClasses: Record<string, ClusterColorClasses> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
    gradient: "from-blue-500 to-blue-400",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-700 dark:text-green-300",
    gradient: "from-green-500 to-green-400",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-300",
    gradient: "from-red-500 to-red-400",
  },
  gray: {
    bg: "bg-zinc-100 dark:bg-zinc-800/40",
    border: "border-zinc-200 dark:border-zinc-700",
    text: "text-zinc-600 dark:text-zinc-400",
    gradient: "from-zinc-500 to-zinc-400",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200 dark:border-purple-800",
    text: "text-purple-700 dark:text-purple-300",
    gradient: "from-purple-500 to-purple-400",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    gradient: "from-amber-500 to-amber-400",
  },
  cyan: {
    bg: "bg-cyan-50 dark:bg-cyan-900/20",
    border: "border-cyan-200 dark:border-cyan-800",
    text: "text-cyan-700 dark:text-cyan-300",
    gradient: "from-cyan-500 to-cyan-400",
  },
  pink: {
    bg: "bg-pink-50 dark:bg-pink-900/20",
    border: "border-pink-200 dark:border-pink-800",
    text: "text-pink-700 dark:text-pink-300",
    gradient: "from-pink-500 to-pink-400",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-200 dark:border-yellow-800",
    text: "text-yellow-700 dark:text-yellow-300",
    gradient: "from-yellow-500 to-yellow-400",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-300",
    gradient: "from-orange-500 to-orange-400",
  },
};

/**
 * Resolve the themed classes for a cluster color, falling back to gray.
 */
export function getClusterColors(
  color: string | undefined,
): ClusterColorClasses {
  return colorClasses[color ?? ""] ?? colorClasses.gray;
}

/**
 * Area-based cluster configuration.
 */
export const AREA_CONFIG: Record<RunArea, { color: string; icon: string }> = {
  auth: { color: "purple", icon: "🔐" },
  state: { color: "amber", icon: "📊" },
  budget: { color: "cyan", icon: "💰" },
  xdr: { color: "pink", icon: "📦" },
};

/**
 * Severity-based cluster configuration.
 */
export const SEVERITY_CONFIG: Record<
  RunSeverity,
  { color: string; icon: string }
> = {
  low: { color: "green", icon: "1" },
  medium: { color: "yellow", icon: "2" },
  high: { color: "orange", icon: "3" },
  critical: { color: "red", icon: "4" },
};

/**
 * Build clusters grouped by status.
 */
export function buildStatusClusters(runs: FuzzingRun[]): RunCluster[] {
  return RUN_STATUSES.map((status) => {
    const config = STATUS_META[status];
    const clusterRuns = runs.filter((r) => r.status === status);

    return {
      id: `status-${status}`,
      label: config.label,
      runs: clusterRuns,
      color: config.color,
      icon: config.icon,
      avgDuration:
        clusterRuns.length > 0
          ? clusterRuns.reduce((sum, r) => sum + r.duration, 0) /
            clusterRuns.length
          : 0,
      avgCpuInstructions:
        clusterRuns.length > 0
          ? clusterRuns.reduce((sum, r) => sum + r.cpuInstructions, 0) /
            clusterRuns.length
          : 0,
      avgMemoryBytes:
        clusterRuns.length > 0
          ? clusterRuns.reduce((sum, r) => sum + r.memoryBytes, 0) /
            clusterRuns.length
          : 0,
      failureRate:
        clusterRuns.length > 0
          ? (clusterRuns.filter((r) => r.status === "failed").length /
              clusterRuns.length) *
            100
          : 0,
    };
  }).filter((c) => c.runs.length > 0);
}

/**
 * Build clusters grouped by area.
 */
export function buildAreaClusters(runs: FuzzingRun[]): RunCluster[] {
  const areas: RunArea[] = ["auth", "state", "budget", "xdr"];

  return areas
    .map((area) => {
      const config = AREA_CONFIG[area];
      const clusterRuns = runs.filter((r) => r.area === area);

      return {
        id: `area-${area}`,
        label: area.charAt(0).toUpperCase() + area.slice(1),
        runs: clusterRuns,
        color: config.color,
        icon: config.icon,
        avgDuration:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.duration, 0) /
              clusterRuns.length
            : 0,
        avgCpuInstructions:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.cpuInstructions, 0) /
              clusterRuns.length
            : 0,
        avgMemoryBytes:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.memoryBytes, 0) /
              clusterRuns.length
            : 0,
        failureRate:
          clusterRuns.length > 0
            ? (clusterRuns.filter((r) => r.status === "failed").length /
                clusterRuns.length) *
              100
            : 0,
      };
    })
    .filter((c) => c.runs.length > 0);
}

/**
 * Build clusters grouped by severity.
 */
export function buildSeverityClusters(runs: FuzzingRun[]): RunCluster[] {
  const severities: RunSeverity[] = ["low", "medium", "high", "critical"];

  return severities
    .map((severity) => {
      const config = SEVERITY_CONFIG[severity];
      const clusterRuns = runs.filter((r) => r.severity === severity);

      return {
        id: `severity-${severity}`,
        label: severity.charAt(0).toUpperCase() + severity.slice(1),
        runs: clusterRuns,
        color: config.color,
        icon: config.icon,
        avgDuration:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.duration, 0) /
              clusterRuns.length
            : 0,
        avgCpuInstructions:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.cpuInstructions, 0) /
              clusterRuns.length
            : 0,
        avgMemoryBytes:
          clusterRuns.length > 0
            ? clusterRuns.reduce((sum, r) => sum + r.memoryBytes, 0) /
              clusterRuns.length
            : 0,
        failureRate:
          clusterRuns.length > 0
            ? (clusterRuns.filter((r) => r.status === "failed").length /
                clusterRuns.length) *
              100
            : 0,
      };
    })
    .filter((c) => c.runs.length > 0);
}

/**
 * Build clusters grouped by performance characteristics.
 */
export function buildPerformanceClusters(runs: FuzzingRun[]): RunCluster[] {
  if (runs.length === 0) return [];

  const avgDuration =
    runs.reduce((sum, r) => sum + r.duration, 0) / runs.length;
  const avgMemory =
    runs.reduce((sum, r) => sum + r.memoryBytes, 0) / runs.length;
  const avgCpu =
    runs.reduce((sum, r) => sum + r.cpuInstructions, 0) / runs.length;

  const clusters = [
    {
      id: "perf-fast",
      label: "Fast Runs",
      runs: runs.filter((r) => r.duration < avgDuration * 0.7),
      color: "green",
      icon: "⚡",
    },
    {
      id: "perf-slow",
      label: "Slow Runs",
      runs: runs.filter((r) => r.duration > avgDuration * 1.5),
      color: "red",
      icon: "🐌",
    },
    {
      id: "perf-memory-heavy",
      label: "Memory Heavy",
      runs: runs.filter((r) => r.memoryBytes > avgMemory * 1.3),
      color: "purple",
      icon: "💾",
    },
    {
      id: "perf-cpu-intensive",
      label: "CPU Intensive",
      runs: runs.filter((r) => r.cpuInstructions > avgCpu * 1.3),
      color: "orange",
      icon: "🔥",
    },
  ];

  return clusters
    .filter((c) => c.runs.length > 0)
    .map((cluster) => ({
      ...cluster,
      avgDuration:
        cluster.runs.reduce((sum, r) => sum + r.duration, 0) /
        cluster.runs.length,
      avgCpuInstructions:
        cluster.runs.reduce((sum, r) => sum + r.cpuInstructions, 0) /
        cluster.runs.length,
      avgMemoryBytes:
        cluster.runs.reduce((sum, r) => sum + r.memoryBytes, 0) /
        cluster.runs.length,
      failureRate:
        (cluster.runs.filter((r) => r.status === "failed").length /
          cluster.runs.length) *
        100,
    }));
}

/**
 * Build clusters grouped by failure signatures.
 */
export function buildFailureSignatureClusters(runs: FuzzingRun[]): RunCluster[] {
  const failureClusters = buildFailureClusters(runs);

  return failureClusters
    .map((fc) => ({
      id: fc.id,
      label: fc.failureCategory,
      runs: runs.filter((r) => fc.relatedRunIds.includes(r.id)),
      color: SEVERITY_CONFIG[fc.severity].color,
      icon: SEVERITY_CONFIG[fc.severity].icon,
      avgDuration: 0, // Could be computed if needed
      avgCpuInstructions: 0,
      avgMemoryBytes: 0,
      failureRate: 100,
    }))
    .map((cluster) => {
      // Fill in metrics
      if (cluster.runs.length === 0) return cluster;

      return {
        ...cluster,
        avgDuration:
          cluster.runs.reduce((sum, r) => sum + r.duration, 0) /
          cluster.runs.length,
        avgCpuInstructions:
          cluster.runs.reduce((sum, r) => sum + r.cpuInstructions, 0) /
          cluster.runs.length,
        avgMemoryBytes:
          cluster.runs.reduce((sum, r) => sum + r.memoryBytes, 0) /
          cluster.runs.length,
      };
    });
}

/**
 * Build clusters for a given grouping mode.
 */
export function buildClustersForMode(
  runs: FuzzingRun[],
  mode: ClusterMode,
): RunCluster[] {
  switch (mode) {
    case "status":
      return buildStatusClusters(runs);
    case "area":
      return buildAreaClusters(runs);
    case "severity":
      return buildSeverityClusters(runs);
    case "performance":
      return buildPerformanceClusters(runs);
    case "failure":
      return buildFailureSignatureClusters(runs);
    default:
      return [];
  }
}

/**
 * Sort clusters by the selected criteria. Sorts in place and returns the same
 * array reference, matching the previous inline behaviour.
 */
export function sortClustersBy(
  clusters: RunCluster[],
  sortBy: ClusterSortKey,
): RunCluster[] {
  return clusters.sort((a, b) => {
    switch (sortBy) {
      case "count":
        return b.runs.length - a.runs.length;
      case "duration":
        return (b.avgDuration || 0) - (a.avgDuration || 0);
      case "failure-rate":
        return (b.failureRate || 0) - (a.failureRate || 0);
      default:
        return 0;
    }
  });
}

/**
 * Derive the aggregate metrics displayed in the overview cards.
 */
export function computeClusterMetrics(runs: FuzzingRun[]): ClusterMetrics {
  const totalRuns = runs.length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  return {
    totalRuns,
    avgDuration: runs.reduce((sum, r) => sum + r.duration, 0) / totalRuns,
    avgCpuInstructions:
      runs.reduce((sum, r) => sum + r.cpuInstructions, 0) / totalRuns,
    avgMemoryBytes:
      runs.reduce((sum, r) => sum + r.memoryBytes, 0) / totalRuns,
    failureRate: (failedRuns / totalRuns) * 100,
    throughput:
      totalRuns /
      Math.max(
        1,
        Math.max(...runs.map((r) => r.duration)) / (1000 * 60 * 60),
      ), // runs per hour
  };
}

/**
 * Human-readable duration, e.g. "3m 20s".
 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Human-readable byte size, e.g. "2.0 KB" or "5.0 MB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build mock cluster data when no runs are provided.
 */
export function buildMockClusters(seed = 123456): FuzzingRun[] {
  // Deterministic PRNG (mulberry32) so server and client generate the
  // same mock data and avoid hydration mismatches.
  function mulberry32(a: number) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(seed);

  return Array.from({ length: 25 }, (_, i) => {
    const status = RUN_STATUSES[i % RUN_STATUSES.length];
    const area = ["auth", "state", "budget", "xdr"][i % 4] as RunArea;
    const severity = ["low", "medium", "high", "critical"][
      i % 4
    ] as RunSeverity;

    return {
      id: `run-${1000 + i}`,
      status,
      area,
      severity,
      duration: Math.round(120000 + rng() * 3600000),
      seedCount: Math.floor(10000 + rng() * 90000),
      crashDetail:
        status === "failed"
          ? {
              failureCategory:
                area.charAt(0).toUpperCase() + area.slice(1),
              signature: `sig:${1000 + i}:${area}::crash`,
              payload: "{}",
              replayAction: "cargo run",
            }
          : null,
      cpuInstructions: Math.floor(400000 + rng() * 900000),
      memoryBytes: Math.floor(1_500_000 + rng() * 8_000_000),
      minResourceFee: Math.floor(500 + rng() * 5000),
    };
  });
}
