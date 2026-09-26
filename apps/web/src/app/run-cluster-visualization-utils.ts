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