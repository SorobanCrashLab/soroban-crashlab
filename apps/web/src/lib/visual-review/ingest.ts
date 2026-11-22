/*
 * ingest.ts — #2298
 * Ingest and index snapshot runs/suites/changed files from CI artifacts
 * (by PR/branch/commit/suite).
 */

export interface SnapshotChange {
  id: string;
  runId: string;
  suite: string;
  component: string;
  route?: string;
  viewport: string;
  theme: string;
  browser: string;
  flakeScore: number;
  status: 'changed' | 'new' | 'removed';
}

export interface SnapshotRun {
  id: string;
  pr?: string;
  branch?: string;
  commit?: string;
  suites: string[];
  changes: SnapshotChange[];
  artifactUrl?: string;
}

export function indexSnapshotArtifact(raw: unknown): SnapshotRun {
  // Phase 1: map raw artifact JSON onto the run index model.
  return raw as SnapshotRun;
}
