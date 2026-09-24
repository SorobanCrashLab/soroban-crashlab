import React, { useCallback, useMemo, useState } from "react";
import { FuzzingRun } from "./types";
import {
  buildClustersForMode,
  buildMockClusters,
  computeClusterMetrics,
  formatBytes,
  formatDuration,
  getClusterColors,
  sortClustersBy,
  type ClusterMetrics,
  type ClusterMode,
  type ClusterSortKey,
  type RunCluster,
  type ViewMode,
} from "./run-cluster-visualization-utils";
import { ClusterControls } from "./run-cluster-controls";
import { ClusterCanvas } from "./run-cluster-canvas";

export type RunClusterVisualizationDataState = "loading" | "error" | "success";

// Re-exported so this module's public API is unchanged while the pure logic
// lives in run-cluster-visualization-utils (the monolith test and any
// downstream importer keep working after the component split).
export {
  buildStatusClusters,
  buildAreaClusters,
  buildSeverityClusters,
  buildPerformanceClusters,
  buildFailureSignatureClusters,
  buildMockClusters,
} from "./run-cluster-visualization-utils";
export type { RunCluster, ClusterMode } from "./run-cluster-visualization-utils";

interface RunClusterVisualizationProps {
  runs?: FuzzingRun[];
  dataState?: RunClusterVisualizationDataState;
  onRetry?: () => void;
  errorMessage?: string;
  onRunSelect?: (runId: string) => void;
  showTimeline?: boolean;
  showMetrics?: boolean;
  initialClusterMode?: ClusterMode;
}

/**
 * Metric card component.
 */
const MetricCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  color: string;
}> = ({ label, value, icon, color }) => {
  const colors = getClusterColors(color);

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
 * Cluster details component.
 */
const ClusterDetails: React.FC<{
  cluster: RunCluster;
  onRunClick: (runId: string) => void;
  onClose: () => void;
}> = ({ cluster, onRunClick, onClose }) => {
  const colors = getClusterColors(cluster.color);

  return (
    <div
      role="region"
      aria-label={`${cluster.label} cluster details`}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 mb-6"
    >
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
          aria-label="Close cluster detail"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
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

const RunClusterVisualization: React.FC<RunClusterVisualizationProps> = ({
  runs = [],
  dataState = "success",
  onRetry,
  errorMessage,
  onRunSelect,
  showTimeline = true,
  showMetrics = true,
  initialClusterMode = "status",
}) => {
  const [clusterMode, setClusterMode] = useState<ClusterMode>(initialClusterMode);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ClusterSortKey>("count");

  const clusters = useMemo<RunCluster[]>(() => {
    const runsData = runs.length > 0 ? runs : buildMockClusters();

    // Group by the selected attribute (pure logic in
    // run-cluster-visualization-utils), then sort in place by the criteria.
    return sortClustersBy(buildClustersForMode(runsData, clusterMode), sortBy);
  }, [runs, clusterMode, sortBy]);

  const metrics = useMemo<ClusterMetrics>(() => {
    const runsData = runs.length > 0 ? runs : buildMockClusters();
    return computeClusterMetrics(runsData);
  }, [runs]);

  const totalRuns = useMemo(() => runs.length || 25, [runs]);

  const handleClusterSelect = useCallback((clusterId: string) => {
    setSelectedCluster((previous) =>
      previous === clusterId ? null : clusterId,
    );
  }, []);

  const handleRunClick = useCallback(
    (runId: string) => {
      onRunSelect?.(runId);
    },
    [onRunSelect],
  );

  const handleCloseDetails = useCallback(() => setSelectedCluster(null), []);

  if (dataState === "loading") {
    return (
      <section className="run-cluster-visualization" aria-busy="true">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-900 animate-pulse rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (dataState === "error") {
    return (
      <section role="alert" className="run-cluster-visualization p-8 border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 rounded-2xl">
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">Cluster Visualization Error</h2>
        <p className="text-red-700 dark:text-red-300 mb-4">{errorMessage || "Failed to load cluster data."}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold shadow-sm"
        >
          Retry Diagnostics
        </button>
      </section>
    );
  }

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
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
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

        <ClusterControls
          clusterMode={clusterMode}
          onClusterModeChange={setClusterMode}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          showTimeline={showTimeline}
          showMetrics={showMetrics}
        />
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
      <ClusterCanvas
        clusters={clusters}
        viewMode={viewMode}
        selectedClusterId={selectedCluster}
        onClusterSelect={handleClusterSelect}
        showTimeline={showTimeline}
        showMetrics={showMetrics}
        totalRuns={totalRuns}
      />

      {/* Selected Cluster Details */}
      {selectedCluster && (
        <ClusterDetails
          cluster={clusters.find((c) => c.id === selectedCluster)!}
          onRunClick={handleRunClick}
          onClose={handleCloseDetails}
        />
      )}
    </section>
  );
};

export default RunClusterVisualization;
