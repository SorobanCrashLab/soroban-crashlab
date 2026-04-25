/**
 * Pure utility helpers for building and validating downloadable artifact bundles.
 * These are extracted from the UI layer so they can be unit-tested without a DOM.
 */

import type { FuzzingRun } from './types';
import { collectRunArtifacts } from './utils/artifact-collection';
import type { RunArtifacts } from './utils/artifact-download';

export interface ArtifactBundle {
  exportedAt: string;
  runCount: number;
  runs: RunArtifacts[];
}

/**
 * Builds a serialisable artifact bundle from an array of fuzzing runs.
 * Returns null when the runs array is empty (nothing to bundle).
 */
export function buildArtifactBundle(runs: FuzzingRun[]): ArtifactBundle | null {
  if (runs.length === 0) return null;
  return {
    exportedAt: new Date().toISOString(),
    runCount: runs.length,
    runs: runs.map((run) => collectRunArtifacts(run)),
  };
}

/**
 * Validates that a bundle contains the required metadata traces and fixture
 * exports for every run entry.
 */
export function validateBundle(bundle: ArtifactBundle): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (bundle.runCount !== bundle.runs.length) {
    errors.push(
      `runCount mismatch: declared ${bundle.runCount} but found ${bundle.runs.length} entries`,
    );
  }

  bundle.runs.forEach((entry, i) => {
    if (!entry.metadata?.id) {
      errors.push(`run[${i}] missing metadata.id`);
    }
    if (!Array.isArray(entry.traces)) {
      errors.push(`run[${i}] traces must be an array`);
    }
    if (!Array.isArray(entry.fixtures)) {
      errors.push(`run[${i}] fixtures must be an array`);
    }
  });

  return { valid: errors.length === 0, errors };
}
