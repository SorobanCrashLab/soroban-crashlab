/**
 * Central TypeScript type definitions for Soroban CrashLab.
 *
 * This module consolidates shared domain types used across the application,
 * providing a single source of truth for data models re-exported through
 * `src/app/types.ts` for backward compatibility.
 */

import type { RunStatus } from '../lib/run-status';

// Re-exports from other modules (for backward compatibility)
export type { RunStatus } from '../lib/run-status';

// Contract-specific types live in ./contracts (single source of truth) and are
// re-exported here so existing `import ... from '../types'` call sites keep
// working unchanged.
export type {
  SorobanAuthMode,
  ContractCallStatus,
  ContractCallStep,
  LedgerChangeType,
  LedgerStateChange,
  ContractCallInfo,
  ContractCallFeeSummary,
  LedgerFieldDiff,
} from './contracts';

// Domain Types
export type RunArea = 'auth' | 'state' | 'budget' | 'xdr';
export type RunSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CrashDetail {
  failureCategory: string;
  signature: string;
  signatureHash?: number;
  payload: string;
  replayAction: string;
}

export interface RunIssueLink {
  label: string;
  href: string;
}

export interface FuzzingRun {
  id: string;
  parentId?: string;
  seedList?: number[];
  status: RunStatus;
  area: RunArea;
  severity: RunSeverity;
  duration: number;
  seedCount: number;
  crashDetail: CrashDetail | null;
  cpuInstructions: number;
  memoryBytes: number;
  minResourceFee: number;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  associatedIssues?: RunIssueLink[];
  annotations?: string[];
  tags?: string[];
  artifacts?: Artifact[];
  replayFingerprint?: import('../app/replay/fingerprint').ReplayFingerprint;
  corpusStats?: CorpusStatPoint[];
}

export interface CorpusStatPoint {
  ts: number;
  corpusSize: number;
  edgesFound: number;
  totalEdges: number;
  /** Executions per second at this sample point (engine telemetry). */
  execsPerSec: number;
  /** Percentage of engine code covered at this sample point. */
  coveragePct: number;
}

export interface CrashGroupSummary {
  signature: string;
  count: number;
  area: RunArea;
  severity: RunSeverity;
}

export interface CrashSignatureSummary {
  totalFailures: number;
  uniqueSignatures: number;
  categories: string[];
  bySeverity: Record<RunSeverity, number>;
  byArea: Partial<Record<RunArea, number>>;
}

export interface CrashTrendPoint {
  date: string;
  [signatureKey: string]: string | number;
}

/**
 * Represents a single crash event for trend analysis.
 */
export interface CrashEvent {
  /** Crash signature (stable hash) */
  signature: string;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Product area */
  area: RunArea;
  /** Severity level */
  severity: RunSeverity;
}

/**
 * Metadata for a unique signature in the dataset.
 */
export interface SignatureFrequency {
  /** Crash signature identifier */
  signature: string;
  /** Total count across all time periods */
  totalCount: number;
  /** Primary area associated with this signature */
  area: RunArea;
  /** Highest severity observed for this signature */
  severity: RunSeverity;
}

export type CampaignSeedSource = 'random' | 'corpus' | 'replay';
export type CampaignAuthMode = 'none' | 'mock' | 'keypair';

export interface CampaignConfig {
  seedSource: CampaignSeedSource;
  authMode: CampaignAuthMode;
  parallelism: number;
  timeoutSeconds: number;
}

export type ArtifactType = 'seed' | 'log' | 'trace' | 'coverage' | 'bundle';
export type ContentType = 'json' | 'text' | 'hex' | 'unknown';

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  size: number;
  updatedAt: string;
  createdAt?: string;
  runId?: string;
  content_hash?: string;
  contentType?: ContentType;
}
