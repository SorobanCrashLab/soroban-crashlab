import React, { memo, useCallback, useState } from "react";
import {
  getClusterColors,
  type RunCluster,
  type ViewMode,
} from "./run-cluster-visualization-utils";
import { ClusterTooltip } from "./run-cluster-tooltip";
import { ClusterLegend } from "./run-cluster-legend";

export interface ClusterCanvasProps {
  clusters: RunCluster[];
  viewMode: ViewMode;
  selectedClusterId: string | null;
  onClusterSelect: (clusterId: string) => void;
  showTimeline: boolean;
  showMetrics: boolean;
  totalRuns: number;
}

/**
 * Diameter for a cluster bubble, clamped to the 60-120px range.
 */
export function bubbleSizeFor(runCount: number): number {
  return Math.max(60, Math.min(120, runCount * 10));
}

/**
 * Card component displaying cluster summary.
 */
const ClusterCard = memo<{
  cluster: RunCluster;
  totalRuns: number;
  isSelected: boolean;
  onSelect: (clusterId: string) => void;
}>(function ClusterCard({ cluster, totalRuns, isSelected, onSelect }) {
  const colors = getClusterColors(cluster.color);
  const percentage =
    totalRuns > 0 ? Math.round((cluster.runs.length / totalRuns) * 100) : 0;
  const select = useCallback(() => onSelect(cluster.id), [cluster.id, onSelect]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${cluster.label}: ${cluster.runs.length} runs`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      className={`relative group rounded-2xl p-5 border transition-all duration-300 cursor-pointer overflow-hidden ${colors.bg} ${
        isSelected
          ? `${colors.border} ring-2 ring-blue-500 dark:ring-blue-400 shadow-lg scale-[1.02]`
          : `${colors.border} hover:shadow-xl hover:-translate-y-1`
      }`}
    >
      {/* Decorative background gradient */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colors.gradient} opacity-5 -mr-10 -mt-10 rounded-full blur-2xl group-hover:opacity-10 transition-opacity`} />

      <div className="flex items-center justify-between mb-4">
        <div className={`flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-white/50 dark:bg-black/20 border ${colors.border}`}>
          <span className="text-lg leading-none" aria-hidden="true">
            {cluster.icon}
          </span>
          <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>
            {cluster.label}
          </span>
        </div>
        {isSelected && (
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
        )}
      </div>

      <div className="relative z-10 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className={`text-3xl font-black ${colors.text}`}>
            {cluster.runs.length}
          </p>
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold opacity-60">{percentage}%</span>
            <span className="text-[10px] uppercase font-bold opacity-40">of total</span>
          </div>
        </div>

        <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-1000`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {cluster.avgDuration !== undefined && (
          <div className="flex items-center justify-between text-[11px] font-bold opacity-70">
            <div className="flex items-center gap-1">
              <span>⏱️</span>
              <span>{Math.round(cluster.avgDuration / 1000 / 60)}m avg</span>
            </div>
            {cluster.failureRate !== undefined && (
              <div className={`flex items-center gap-1 ${cluster.failureRate > 20 ? 'text-red-600 dark:text-red-400' : ''}`}>
                <span>⚠️</span>
                <span>{cluster.failureRate.toFixed(1)}% fails</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
ClusterCard.displayName = "ClusterCard";

/**
 * Bubble component for visual cluster representation. Shows the styled
 * tooltip (instead of a native `title`) on hover and keyboard focus, and is
 * fully operable from the keyboard.
 */
const ClusterBubble = memo<{
  cluster: RunCluster;
  size: number;
  animationDelay?: string;
  isSelected: boolean;
  onSelect: (clusterId: string) => void;
}>(function ClusterBubble({
  cluster,
  size,
  animationDelay,
  isSelected,
  onSelect,
}) {
  const colors = getClusterColors(cluster.color);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const showTooltip = useCallback(() => setTooltipVisible(true), []);
  const hideTooltip = useCallback(() => setTooltipVisible(false), []);
  const select = useCallback(() => onSelect(cluster.id), [cluster.id, onSelect]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${cluster.label}: ${cluster.runs.length} runs`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className={`relative flex flex-col items-center justify-center rounded-full border-2 transition-all duration-500 cursor-pointer hover:shadow-2xl active:scale-95 ${colors.bg} ${
        isSelected
          ? "ring-4 ring-blue-500/50 dark:ring-blue-400/50 scale-110 shadow-2xl border-white dark:border-zinc-800"
          : `${colors.border} hover:scale-110`
      }`}
      style={{
        width: size,
        height: size,
        animation: "float 6s ease-in-out infinite",
        animationDelay: animationDelay || "0ms",
        boxShadow: isSelected
          ? `0 0 20px ${cluster.color === 'gray' ? 'rgba(0,0,0,0.2)' : 'rgba(59,130,246,0.3)'}`
          : 'none',
      }}
    >
      <ClusterTooltip
        label={cluster.label}
        detail={`${cluster.runs.length} runs`}
        visible={tooltipVisible}
      />
      <span className={`text-lg font-black tracking-tighter ${colors.text}`}>
        {cluster.runs.length}
      </span>
      <span className="text-[10px] font-bold opacity-60 uppercase">{cluster.icon}</span>
    </div>
  );
});
ClusterBubble.displayName = "ClusterBubble";

/**
 * Timeline visualization component.
 */
const TimelineVisualization: React.FC<{ clusters: RunCluster[] }> = ({
  clusters,
}) => {
  return (
    <div
      role="region"
      aria-label="Cluster timeline"
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 mb-6"
    >
      <h3 className="text-lg font-semibold mb-4">Cluster Timeline</h3>
      <div className="space-y-3">
        {clusters.map((cluster, index) => {
          const colors = getClusterColors(cluster.color);
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
    <div
      role="region"
      aria-label="Cluster metrics"
      className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
    >
      {/* Performance Comparison */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Comparison</h3>
        <div className="space-y-4">
          {clusters.map((cluster) => {
            const colors = getClusterColors(cluster.color);
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
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
              const colors = getClusterColors(cluster.color);
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
 * Main visualization surface: renders the active view (grid, bubbles,
 * timeline or metrics). Memoized: the parent passes a stable clusters array,
 * a plain view/id state, and a stable callback, so re-renders only happen
 * when the visualization actually changes.
 */
export const ClusterCanvas = memo<ClusterCanvasProps>(function ClusterCanvas({
  clusters,
  viewMode,
  selectedClusterId,
  onClusterSelect,
  showTimeline,
  showMetrics,
  totalRuns,
}) {
  return (
    <>
      {viewMode === "grid" && (
        <div
          role="region"
          aria-label="Cluster visualization grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6"
        >
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              totalRuns={totalRuns}
              isSelected={selectedClusterId === cluster.id}
              onSelect={onClusterSelect}
            />
          ))}
        </div>
      )}

      {viewMode === "bubbles" && (
        <>
          <ClusterLegend clusters={clusters} />
          <div
            role="region"
            aria-label="Cluster bubble visualization"
            className="relative h-64 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-900/50 dark:to-zinc-800/30 border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6"
          >
            <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-4 p-6">
              {clusters.map((cluster, index) => (
                <ClusterBubble
                  key={cluster.id}
                  cluster={cluster}
                  size={bubbleSizeFor(cluster.runs.length)}
                  animationDelay={`${index * 100}ms`}
                  isSelected={selectedClusterId === cluster.id}
                  onSelect={onClusterSelect}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === "timeline" && showTimeline && (
        <TimelineVisualization clusters={clusters} />
      )}

      {viewMode === "metrics" && showMetrics && (
        <MetricsVisualization clusters={clusters} />
      )}
    </>
  );
});

ClusterCanvas.displayName = "ClusterCanvas";
