import React, { useMemo, useState, useCallback } from "react";
import { FuzzingRun, RunStatus, RunArea, RunSeverity } from "./types";

interface RunClusterVisualizationProps {
  runs?: FuzzingRun[];
  onRunSelect?: (runId: string) => void;
  showTimeline?: boolean;
  showMetrics?: boolean;
}

/**
 * Represents a cluster of runs grouped by a common attribute.
 */
interface RunCluster {
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
interface ClusterMetrics {
  totalRuns: number;
  avgDuration: number;
  avgCpuInstructions: number;
  avgMemoryBytes: number;
  failureRate: number;
  throughput: number;
}

/**
 * Status-based cluster configuration.
 */
const STATUS_CONFIG: Record<RunStatus, { color: string; icon: string }> = {
  running: { color: "blue", icon: "●" },
  completed: { color: "green", icon: "✓" },
  failed: { color: "red", icon: "✗" },
  cancelled: { color: "gray", icon: "○" },
};

/**
 * Area-based cluster configuration.
 */
const AREA_CONFIG: Record<RunArea, { color: string; icon: string }> = {
  auth: { color: "purple", icon: "🔐" },
  state: { color: "amber", icon: "📊" },
  budget: { color: "cyan", icon: "💰" },
  xdr: { color: "pink", icon: "📦" },
};

/**
 * Severity-based cluster configuration.
 */
const SEVERITY_CONFIG: Record<RunSeverity, { color: string; icon: string }> = {
  low: { color: "green", icon: "1" },
  medium: { color: "yellow", icon: "2" },
  high: { color: "orange", icon: "3" },
  critical: { color: "red", icon: "4" },
};

const colorClasses: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    border: "border-blue-300 dark:border-blue-700",
    text: "text-blue-700 dark:text-blue-300",
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/30",
    border: "border-green-300 dark:border-green-700",
    text: "text-green-700 dark:text-green-300",
  },
  red: {
    bg: "bg-red-100 dark:bg-red-900/30",
    border: "border-red-300 dark:border-red-700",
    text: "text-red-700 dark:text-red-300",
  },
  gray: {
    bg: "bg-zinc-100 dark:bg-zinc-800/50",
    border: "border-zinc-300 dark:border-zinc-600",
    text: "text-zinc-600 dark:text-zinc-300",
  },
  purple: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    border: "border-purple-300 dark:border-purple-700",
    text: "text-purple-700 dark:text-purple-300",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-300 dark:border-amber-700",
    text: "text-amber-700 dark:text-amber-300",
  },
  cyan: {
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
    border: "border-cyan-300 dark:border-cyan-700",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  pink: {
    bg: "bg-pink-100 dark:bg-pink-900/30",
    border: "border-pink-300 dark:border-pink-700",
    text: "text-pink-700 dark:text-pink-300",
  },
  yellow: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    border: "border-yellow-300 dark:border-yellow-700",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    border: "border-orange-300 dark:border-orange-700",
    text: "text-orange-700 dark:text-orange-300",
  },
};

type ClusterMode = "status" | "area" | "severity" | "performance";
type ViewMode = "grid" | "bubbles" | "timeline" | "metrics";

const RunClusterVisualization: React.FC<RunClusterVisualizationProps> = ({
  runs = [],
  onRunSelect,
  showTimeline = true,
  showMetrics = true,
}) => {
  const [clusterMode, setClusterMode] = useState<ClusterMode>("status");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"count" | "duration" | "failure-rate">(
    "count",
  );

  const clusters = useMemo<RunCluster[]>(() => {
    const runsData = runs.length > 0 ? runs : buildMockClusters();

    let clustersData: RunCluster[];
    switch (clusterMode) {
      case "status":
        clustersData = buildStatusClusters(runsData);
        break;
      case "area":
        clustersData = buildAreaClusters(runsData);
        break;
      case "severity":
        clustersData = buildSeverityClusters(runsData);
        break;
      case "performance":
        clustersData = buildPerformanceClusters(runsData);
        break;
      default:
        clustersData = [];
    }

    // Sort clusters based on selected criteria
    return clustersData.sort((a, b) => {
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
  }, [runs, clusterMode, sortBy]);

  const metrics = useMemo<ClusterMetrics>(() => {
    const runsData = runs.length > 0 ? runs : buildMockClusters();
    const totalRuns = runsData.length;
    const failedRuns = runsData.filter((r) => r.status === "failed").length;

    return {
      totalRuns,
      avgDuration: runsData.reduce((sum, r) => sum + r.duration, 0) / totalRuns,
      avgCpuInstructions:
        runsData.reduce((sum, r) => sum + r.cpuInstructions, 0) / totalRuns,
      avgMemoryBytes:
        runsData.reduce((sum, r) => sum + r.memoryBytes, 0) / totalRuns,
      failureRate: (failedRuns / totalRuns) * 100,
      throughput:
        totalRuns /
        Math.max(
          1,
          Math.max(...runsData.map((r) => r.duration)) / (1000 * 60 * 60),
        ), // runs per hour
    };
  }, [runs]);

  const totalRuns = useMemo(() => runs.length || 25, [runs]);

  const handleClusterClick = useCallback(
    (clusterId: string) => {
      setSelectedCluster(selectedCluster === clusterId ? null : clusterId);
    },
    [selectedCluster],
  );

  const handleRunClick = useCallback(
    (runId: string) => {
      onRunSelect?.(runId);
    },
    [onRunSelect],
  );

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (clusters.length === 0) {
    return (
      <section
        className="run-cluster-visualization"
        aria-label="Run cluster visualization"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Run Clusters</h2>
        </div>
        <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">
            No cluster data available.
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            Start a new campaign to see cluster visualization.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="run-cluster-visualization"
      aria-label="Run cluster visualization"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Run Clusters</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Analyze {totalRuns} runs grouped by {clusterMode} •{" "}
            {clusters.length} clusters
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Cluster Mode Selection */}
          <div
            className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1"
            role="group"
            aria-label="Cluster grouping mode"
          >
            <ClusterModeButton
              active={clusterMode === "status"}
              onClick={() => setClusterMode("status")}
            >
              Status
            </ClusterModeButton>
            <ClusterModeButton
              active={clusterMode === "area"}
              onClick={() => setClusterMode("area")}
            >
              Area
            </ClusterModeButton>
            <ClusterModeButton
              active={clusterMode === "severity"}
              onClick={() => setClusterMode("severity")}
            >
              Severity
            </ClusterModeButton>
            <ClusterModeButton
              active={clusterMode === "performance"}
              onClick={() => setClusterMode("performance")}
            >
              Performance
            </ClusterModeButton>
          </div>

          {/* View Mode Selection */}
          <div
            className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1"
            role="group"
            aria-label="View mode"
          >
            <ViewModeButton
              active={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              icon="⊞"
            >
              Grid
            </ViewModeButton>
            <ViewModeButton
              active={viewMode === "bubbles"}
              onClick={() => setViewMode("bubbles")}
              icon="●"
            >
              Bubbles
            </ViewModeButton>
            {showTimeline && (
              <ViewModeButton
                active={viewMode === "timeline"}
                onClick={() => setViewMode("timeline")}
                icon="📊"
              >
                Timeline
              </ViewModeButton>
            )}
            {showMetrics && (
              <ViewModeButton
                active={viewMode === "metrics"}
                onClick={() => setViewMode("metrics")}
                icon="📈"
              >
                Metrics
              </ViewModeButton>
            )}
          </div>

          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
          >
            <option value="count">Sort by Count</option>
            <option value="duration">Sort by Duration</option>
            <option value="failure-rate">Sort by Failure Rate</option>
          </select>
        </div>
      </div>

      {/* Metrics Overview */}
      {showMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <MetricCard
            label="Total Runs"
            value={metrics.totalRuns.toString()}
            icon="🏃"
            color="blue"
          />
          <MetricCard
            label="Avg Duration"
            value={formatDuration(metrics.avgDuration)}
            icon="⏱️"
            color="green"
          />
          <MetricCard
            label="Failure Rate"
            value={`${metrics.failureRate.toFixed(1)}%`}
            icon="⚠️"
            color={
              metrics.failureRate > 20
                ? "red"
                : metrics.failureRate > 10
                  ? "amber"
                  : "green"
            }
          />
          <MetricCard
            label="Avg Memory"
            value={formatBytes(metrics.avgMemoryBytes)}
            icon="💾"
            color="purple"
          />
          <MetricCard
            label="Throughput"
            value={`${metrics.throughput.toFixed(1)}/h`}
            icon="⚡"
            color="cyan"
          />
        </div>
      )}

      {/* Main Visualization */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              totalRuns={totalRuns}
              isSelected={selectedCluster === cluster.id}
              onClick={() => handleClusterClick(cluster.id)}
            />
          ))}
        </div>
      )}

      {viewMode === "bubbles" && (
        <div className="relative h-64 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-900/50 dark:to-zinc-800/30 border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-4 p-6">
            {clusters.map((cluster, index) => (
              <ClusterBubble
                key={cluster.id}
                cluster={cluster}
                size={Math.max(60, Math.min(120, cluster.runs.length * 10))}
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => handleClusterClick(cluster.id)}
                isSelected={selectedCluster === cluster.id}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === "timeline" && showTimeline && (
        <TimelineVisualization clusters={clusters} />
      )}

      {viewMode === "metrics" && showMetrics && (
        <MetricsVisualization clusters={clusters} />
      )}

      {/* Selected Cluster Details */}
      {selectedCluster && (
        <ClusterDetails
          cluster={clusters.find((c) => c.id === selectedCluster)!}
          onRunClick={handleRunClick}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </section>
  );
};

/**
 * Button component for cluster mode selection.
 */
const ClusterModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      active
        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:bg-zinc-200 dark:hover:bg-zinc-700"
    }`}
  >
    {children}
  </button>
);

/**
 * Card component displaying cluster summary.
 */
const ClusterCard: React.FC<{
  cluster: RunCluster;
  totalRuns: number;
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ cluster, totalRuns, isSelected = false, onClick }) => {
  const colors = colorClasses[cluster.color] || colorClasses.gray;
  const percentage =
    totalRuns > 0 ? Math.round((cluster.runs.length / totalRuns) * 100) : 0;

  return (
    <div
      className={`rounded-xl p-4 border transition-all cursor-pointer ${colors.bg} ${
        isSelected
          ? `${colors.border} ring-2 ring-blue-500 dark:ring-blue-400`
          : `${colors.border} hover:shadow-md hover:scale-105`
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg" aria-hidden="true">
          {cluster.icon}
        </span>
        <span className={`text-sm font-medium ${colors.text}`}>
          {cluster.label}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <p className={`text-2xl font-bold ${colors.text}`}>
            {cluster.runs.length}
          </p>
          <span className="text-xs opacity-70">{percentage}%</span>
        </div>

        {cluster.avgDuration && (
          <div className="text-xs opacity-75">
            <div>Avg: {Math.round(cluster.avgDuration / 1000 / 60)}m</div>
            {cluster.failureRate !== undefined && (
              <div>Failures: {cluster.failureRate.toFixed(1)}%</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Bubble component for visual cluster representation.
 */
const ClusterBubble: React.FC<{
  cluster: RunCluster;
  size: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  isSelected?: boolean;
}> = ({ cluster, size, style, onClick, isSelected = false }) => {
  const colors = colorClasses[cluster.color] || colorClasses.gray;

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-full border-2 transition-all cursor-pointer animate-pulse ${colors.bg} ${
        isSelected
          ? "ring-4 ring-blue-500 dark:ring-blue-400 scale-110"
          : `${colors.border} hover:scale-110`
      }`}
      style={{ width: size, height: size, animationDuration: "2s", ...style }}
      title={`${cluster.label}: ${cluster.runs.length} runs`}
      onClick={onClick}
    >
      <span className={`text-sm font-bold ${colors.text}`}>
        {cluster.runs.length}
      </span>
      <span className="text-xs opacity-75">{cluster.icon}</span>
    </div>
  );
};

/**
 * Build clusters grouped by status.
 */
function buildStatusClusters(runs: FuzzingRun[]): RunCluster[] {
  const statuses: RunStatus[] = ["running", "completed", "failed", "cancelled"];

  return statuses
    .map((status) => {
      const config = STATUS_CONFIG[status];
      const clusterRuns = runs.filter((r) => r.status === status);

      return {
        id: `status-${status}`,
        label: status.charAt(0).toUpperCase() + status.slice(1),
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
 * Build clusters grouped by area.
 */
function buildAreaClusters(runs: FuzzingRun[]): RunCluster[] {
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
function buildSeverityClusters(runs: FuzzingRun[]): RunCluster[] {
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
function buildPerformanceClusters(runs: FuzzingRun[]): RunCluster[] {
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
 * View mode button component.
 */
const ViewModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active
        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
    }`}
  >
    <span aria-hidden="true">{icon}</span>
    {children}
  </button>
);

/**
 * Metric card component.
 */
const MetricCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  color: string;
}> = ({ label, value, icon, color }) => {
  const colors = colorClasses[color] || colorClasses.gray;

  return (
    <div className={`rounded-lg p-3 ${colors.bg} ${colors.border} border`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm" aria-hidden="true">
          {icon}
        </span>
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <p className={`text-lg font-bold ${colors.text}`}>{value}</p>
    </div>
  );
};

/**
 * Timeline visualization component.
 */
const TimelineVisualization: React.FC<{ clusters: RunCluster[] }> = ({
  clusters,
}) => {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">Cluster Timeline</h3>
      <div className="space-y-3">
        {clusters.map((cluster, index) => {
          const colors = colorClasses[cluster.color] || colorClasses.gray;
          const maxRuns = Math.max(...clusters.map((c) => c.runs.length));
          const width = (cluster.runs.length / maxRuns) * 100;

          return (
            <div key={cluster.id} className="flex items-center gap-4">
              <div className="w-20 text-sm font-medium">{cluster.label}</div>
              <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-6 relative overflow-hidden">
                <div
                  className={`h-full ${colors.bg} ${colors.border} border-r-2 transition-all duration-1000 ease-out flex items-center justify-end pr-2`}
                  style={{
                    width: `${width}%`,
                    animationDelay: `${index * 200}ms`,
                  }}
                >
                  <span className={`text-xs font-bold ${colors.text}`}>
                    {cluster.runs.length}
                  </span>
                </div>
              </div>
              <div className="w-16 text-sm text-zinc-500 dark:text-zinc-400">
                {(
                  (cluster.runs.length /
                    clusters.reduce((sum, c) => sum + c.runs.length, 0)) *
                  100
                ).toFixed(1)}
                %
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Metrics visualization component.
 */
const MetricsVisualization: React.FC<{ clusters: RunCluster[] }> = ({
  clusters,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Performance Comparison */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Comparison</h3>
        <div className="space-y-4">
          {clusters.map((cluster) => {
            const colors = colorClasses[cluster.color] || colorClasses.gray;
            return (
              <div key={cluster.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${colors.text}`}>
                    {cluster.icon} {cluster.label}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {cluster.runs.length} runs
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      Duration
                    </div>
                    <div className="font-medium">
                      {cluster.avgDuration
                        ? Math.round(cluster.avgDuration / 1000 / 60)
                        : 0}
                      m
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      Memory
                    </div>
                    <div className="font-medium">
                      {cluster.avgMemoryBytes
                        ? (cluster.avgMemoryBytes / (1024 * 1024)).toFixed(1)
                        : 0}
                      MB
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      Failures
                    </div>
                    <div className="font-medium">
                      {cluster.failureRate?.toFixed(1) || 0}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Failure Rate Analysis */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Failure Rate Analysis</h3>
        <div className="space-y-3">
          {clusters
            .sort((a, b) => (b.failureRate || 0) - (a.failureRate || 0))
            .map((cluster) => {
              const colors = colorClasses[cluster.color] || colorClasses.gray;
              const failureRate = cluster.failureRate || 0;

              return (
                <div key={cluster.id} className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${colors.bg} ${colors.border} border`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {cluster.label}
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          failureRate > 20
                            ? "text-red-600 dark:text-red-400"
                            : failureRate > 10
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        {failureRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full ${
                          failureRate > 20
                            ? "bg-red-500"
                            : failureRate > 10
                              ? "bg-amber-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(failureRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

/**
 * Cluster details component.
 */
const ClusterDetails: React.FC<{
  cluster: RunCluster;
  onRunClick: (runId: string) => void;
  onClose: () => void;
}> = ({ cluster, onRunClick, onClose }) => {
  const colors = colorClasses[cluster.color] || colorClasses.gray;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {cluster.icon}
          </span>
          <div>
            <h3 className="text-xl font-bold">{cluster.label} Cluster</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {cluster.runs.length} runs •{" "}
              {cluster.failureRate?.toFixed(1) || 0}% failure rate
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
            Avg Duration
          </div>
          <div className={`text-lg font-bold ${colors.text}`}>
            {cluster.avgDuration
              ? Math.round(cluster.avgDuration / 1000 / 60)
              : 0}
            m
          </div>
        </div>
        <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
            Avg Memory
          </div>
          <div className={`text-lg font-bold ${colors.text}`}>
            {cluster.avgMemoryBytes
              ? (cluster.avgMemoryBytes / (1024 * 1024)).toFixed(1)
              : 0}
            MB
          </div>
        </div>
        <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
            Avg CPU
          </div>
          <div className={`text-lg font-bold ${colors.text}`}>
            {cluster.avgCpuInstructions
              ? (cluster.avgCpuInstructions / 1000).toFixed(0)
              : 0}
            K
          </div>
        </div>
        <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
            Success Rate
          </div>
          <div className={`text-lg font-bold ${colors.text}`}>
            {(100 - (cluster.failureRate || 0)).toFixed(1)}%
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">
          Recent Runs ({cluster.runs.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {cluster.runs.slice(0, 12).map((run) => (
            <button
              key={run.id}
              onClick={() => onRunClick(run.id)}
              className="text-left p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  {run.id}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    run.status === "completed"
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      : run.status === "failed"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        : run.status === "running"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {run.status}
                </span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {Math.round(run.duration / 1000 / 60)}m •{" "}
                {(run.memoryBytes / (1024 * 1024)).toFixed(1)}MB
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Build mock cluster data when no runs are provided.
 */
function buildMockClusters(seed = 123456): FuzzingRun[] {
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

  return Array.from({ length: 25 }, (_, i) => ({
    id: `run-${1000 + i}`,
    status: ["running", "completed", "failed", "cancelled"][i % 4] as RunStatus,
    area: ["auth", "state", "budget", "xdr"][i % 4] as RunArea,
    severity: ["low", "medium", "high", "critical"][i % 4] as RunSeverity,
    duration: Math.round(120000 + rng() * 3600000),
    seedCount: Math.floor(10000 + rng() * 90000),
    crashDetail: null,
    cpuInstructions: Math.floor(400000 + rng() * 900000),
    memoryBytes: Math.floor(1_500_000 + rng() * 8_000_000),
    minResourceFee: Math.floor(500 + rng() * 5000),
  }));
}

export default RunClusterVisualization;
