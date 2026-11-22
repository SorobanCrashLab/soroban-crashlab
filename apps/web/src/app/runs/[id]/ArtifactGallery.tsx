"use client";

/**
 * Artifact Gallery component for run detail page.
 * Issue #1350 & #1349: Handle runs with zero artifacts gracefully.
 */

import type { FuzzingRun } from "../../types";
import { EmptyStateIllustration } from "@/components/EmptyStateIllustration";

interface ArtifactGalleryProps {
  run: FuzzingRun;
}

export default function ArtifactGallery({ run }: ArtifactGalleryProps) {
  const artifacts = run.artifacts || [];
  const hasArtifacts = artifacts.length > 0;

  if (!hasArtifacts) {
    return (
      <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Artifacts</h2>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <EmptyStateIllustration variant="artifacts" size="sm" className="mb-2" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No artifacts were produced by this run
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-sm">
            This run may have failed before generating any artifacts
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-4">
        Artifacts ({artifacts.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-medium text-sm truncate">{artifact.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                {artifact.type}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatBytes(artifact.size)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
