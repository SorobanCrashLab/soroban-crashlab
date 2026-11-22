/**
 * Artifact mapping utilities for transforming and normalizing artifact data
 */

import type { ArtifactMetadata } from "./artifact-fs-adapter";

export interface ArtifactMapping {
  id: string;
  displayName: string;
  category: string;
  timestamp: Date;
  size: number;
}

/**
 * Maps artifact metadata to display format
 */
export function mapArtifactToDisplay(
  artifact: ArtifactMetadata,
): ArtifactMapping {
  return {
    id: artifact.id,
    displayName: artifact.name,
    category: inferCategoryFromName(artifact.name),
    timestamp: new Date(artifact.createdAt),
    size: artifact.sizeBytes,
  };
}

/**
 * Maps multiple artifacts to display format
 */
export function mapArtifactsToDisplay(
  artifacts: ArtifactMetadata[],
): ArtifactMapping[] {
  return artifacts.map(mapArtifactToDisplay);
}

/**
 * Infers artifact category from file name
 */
export function inferCategoryFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";

  const categories: Record<string, string> = {
    log: "logs",
    txt: "logs",
    json: "data",
    csv: "data",
    xml: "data",
    png: "images",
    jpg: "images",
    jpeg: "images",
    gif: "images",
    zip: "archives",
    tar: "archives",
    gz: "archives",
  };

  return categories[ext] || "other";
}

/**
 * Formats bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Groups artifacts by category
 */
export function groupArtifactsByCategory(
  artifacts: ArtifactMapping[],
): Record<string, ArtifactMapping[]> {
  return artifacts.reduce(
    (acc, artifact) => {
      const category = artifact.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(artifact);
      return acc;
    },
    {} as Record<string, ArtifactMapping[]>,
  );
}

/**
 * Filters artifacts by date range
 */
export function filterArtifactsByDateRange(
  artifacts: ArtifactMapping[],
  startDate: Date,
  endDate: Date,
): ArtifactMapping[] {
  return artifacts.filter((artifact) => {
    const timestamp = artifact.timestamp.getTime();
    return timestamp >= startDate.getTime() && timestamp <= endDate.getTime();
  });
}

/**
 * Sorts artifacts by specified field
 */
export function sortArtifacts(
  artifacts: ArtifactMapping[],
  field: keyof ArtifactMapping,
  order: "asc" | "desc" = "desc",
): ArtifactMapping[] {
  return [...artifacts].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    if (aVal < bVal) return order === "asc" ? -1 : 1;
    if (aVal > bVal) return order === "asc" ? 1 : -1;
    return 0;
  });
}
