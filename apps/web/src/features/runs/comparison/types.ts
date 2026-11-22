/**
 * Shared types for the Multi-Run Comparison Workbench (#2195).
 *
 * Kept dependency-free so the workbench can be code-split and loaded lazily
 * from the existing run comparison entry point.
 */

export type ComparisonRole = "baseline" | "candidate";

export type DeltaClassification = "regression" | "improvement" | "stable" | "neutral";

export type ComparisonPanel = "metrics" | "artifacts" | "replay" | "summary" | "campaigns";

export type ArtifactDiffKind = "binary" | "json" | "text";

export interface RunSlot {
  id: string;
  runId: string;
  role: ComparisonRole;
  pinned: boolean;
}

export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  /** Optional scale applied before display (e.g. 1/1000 for ms → s). */
  scale?: number;
}

export interface MetricDelta {
  key: string;
  label: string;
  unit: string;
  baseline: number;
  candidate: number;
  absoluteDelta: number;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat";
  classification: DeltaClassification;
  baselineDisplay: string;
  candidateDisplay: string;
}

export interface TextDiffLine {
  kind: "context" | "added" | "removed";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface TextDiffHunk {
  header: string;
  lines: TextDiffLine[];
}

export interface TextDiffResult {
  kind: "text";
  hunks: TextDiffHunk[];
  unifiedPatch: string;
  additions: number;
  deletions: number;
}

export type JsonDiffChangeType = "added" | "removed" | "modified" | "type-changed";

export interface JsonDiffEntry {
  path: string;
  type: JsonDiffChangeType;
  before?: unknown;
  after?: unknown;
}

export interface JsonDiffResult {
  kind: "json";
  entries: JsonDiffEntry[];
  additions: number;
  deletions: number;
  modifications: number;
}

export interface BinaryDiffChunk {
  offset: number;
  length: number;
  beforeHex: string;
  afterHex: string;
}

export interface BinaryDiffResult {
  kind: "binary";
  baselineSize: number;
  candidateSize: number;
  sizeDelta: number;
  sizeDeltaPercent: number | null;
  identicalPrefixBytes: number;
  identicalSuffixBytes: number;
  changedBytes: number;
  chunks: BinaryDiffChunk[];
  truncated: boolean;
}

export type ArtifactDiffResult = TextDiffResult | JsonDiffResult | BinaryDiffResult;

export interface ArtifactComparison {
  artifactName: string;
  kind: ArtifactDiffKind;
  status: "idle" | "loading" | "ready" | "error";
  result?: ArtifactDiffResult;
  error?: string;
}

export interface CrashRecord {
  runId: string;
  fingerprint: string;
  signature: string;
  timestampMs: number;
  severity: string;
}

export interface CrashMatch {
  baseline: CrashRecord;
  candidate: CrashRecord;
  score: number;
  kind: "exact" | "fuzzy";
}

export interface CrashCorrelationResult {
  matched: CrashMatch[];
  newInCandidate: CrashRecord[];
  removedFromBaseline: CrashRecord[];
}

export interface ReplayPosition {
  runId: string;
  /** Normalised 0–1 position on the shared timeline. */
  ratio: number;
  elapsedMs: number;
  durationMs: number;
}

export interface ReplaySyncState {
  playing: boolean;
  ratio: number;
  positions: ReplayPosition[];
  linkedCrash?: CrashMatch;
}

export interface AggregateStats {
  count: number;
  min: number;
  max: number;
  median: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface CampaignAggregate {
  campaignId: string;
  runCount: number;
  byMetric: Record<string, AggregateStats>;
}

export interface ComparisonExportOptions {
  includeMetrics: boolean;
  includeArtifacts: boolean;
  includeCrashes: boolean;
}
