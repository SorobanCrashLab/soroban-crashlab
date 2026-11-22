import React from "react";
import {
  getClusterColors,
  type ClusterColorClasses,
  type RunCluster,
} from "./run-cluster-visualization-utils";

/**
 * One swatch-bearing legend row.
 */
export interface ClusterLegendItem {
  id: string;
  label: string;
  runCount: number;
  colors: ClusterColorClasses;
}

/**
 * Derive legend rows from the current clusters, preserving cluster order.
 */
export function buildLegendItems(clusters: RunCluster[]): ClusterLegendItem[] {
  return clusters.map((cluster) => ({
    id: cluster.id,
    label: cluster.label,
    runCount: cluster.runs.length,
    colors: getClusterColors(cluster.color),
  }));
}

export interface ClusterLegendProps {
  clusters: RunCluster[];
}

/**
 * Color swatch plus label list mapping cluster colors to their groups.
 * Rendered above the bubble view, where clusters are drawn unlabelled.
 */
export const ClusterLegend: React.FC<ClusterLegendProps> = ({ clusters }) => {
  const items = buildLegendItems(clusters);

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3"
      role="list"
      aria-label="Cluster legend"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="listitem"
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${item.colors.bg} ${item.colors.border} border`}
            aria-hidden="true"
          />
          <span>{item.label}</span>
          <span className="text-zinc-400 dark:text-zinc-500">
            {item.runCount}
          </span>
        </div>
      ))}
    </div>
  );
};

ClusterLegend.displayName = "ClusterLegend";
