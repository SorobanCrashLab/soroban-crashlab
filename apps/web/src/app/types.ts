/**
 * Status variants for a fuzzing run.
 *
 * Defined once in `src/lib/run-status.ts` alongside its label/colour/order
 * metadata and re-exported here so existing `from './types'` imports keep
 * working. Do not re-declare the union — see that module.
 */
import type { RunStatus } from '../lib/run-status';

export type { RunStatus };
export type RunArea = 'auth' | 'state' | 'budget' | 'xdr';
export type RunSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Crash details captured when a run fails.
 */
export interface CrashDetail {
    /** High-level category used to group failures */
    failureCategory: string;
    /** Stable signature for de-duplicating failures */
    signature: string;
    /**
     * Stable numeric hash derived from category + payload bytes.
     * Mirrors the Rust `CrashGroupRecord.signature_hash` (u64) produced by the
     * crash de-dup index.  Two failures with equal `signatureHash` values are
     * considered equivalent regardless of which seed produced them.
     *
     * Stored as a JavaScript `number` (safe for hashes up to 2^53 – 1).
     */
    signatureHash?: number;
    /** Payload associated with the failing input */
    payload: string;
    /** Command or action used to replay locally */
    replayAction: string;
}

export interface RunIssueLink {
    /** Display label for the issue reference */
    label: string;
    /** Fully qualified URL for the issue */
    href: string;
}

/**
 * Interface representing a single fuzzing run.
 */
export interface FuzzingRun {
    /** Unique identifier for the run */
    id: string;
    /** Parent run this run was derived from, when replaying a subset of failing seeds */
    parentId?: string;
    /** Ordered subset of seed indexes replayed for this lineage child */
    seedList?: number[];
    /** Current state of the run */
    status: RunStatus;
    /** Product area primarily exercised by the run */
    area: RunArea;
    /** Highest observed severity level for the run */
    severity: RunSeverity;
    /** Total elapsed duration in milliseconds */
    duration: number;
    /** Number of seeds used/generated during the run */
    seedCount: number;
    /** Crash detail payload when the run has failed */
    crashDetail: CrashDetail | null;
    /** CPU instructions consumed by the run */
    cpuInstructions: number;
    /** Memory bytes consumed by the run */
    memoryBytes: number;
    /** Minimum resource fee measured for the run */
    minResourceFee: number;
    /** Timestamp when the run was queued */
    queuedAt?: string;
    /** Timestamp when the run started */
    startedAt?: string;
    /** Timestamp when the run reached a final state */
    finishedAt?: string;
    /** Related issue tracker entries for the run */
    associatedIssues?: RunIssueLink[];
    /** Custom annotations and notes for the run */
    annotations?: string[];
    /** User-defined tags for triage and filtering */
    tags?: string[];
    /** Artifacts produced by this run, when available. */
    artifacts?: Artifact[];
    /** Deterministic replay verification fingerprint */
    replayFingerprint?: import('./replay/fingerprint').ReplayFingerprint;
    /** Engine coverage counter time-series telemetry */
    corpusStats?: CorpusStatPoint[];
}

/**
 * Single data point in corpus statistics time-series.
 */
export interface CorpusStatPoint {
    ts: number;
    corpusSize: number;
    execsPerSec: number;
    coveragePct: number;
}

/**
 * Aggregated telemetry dataset from fuzzing engine coverage counters.
 */
export interface CorpusStatsTelemetry {
    corpusSize: number;
    execsPerSec: number;
    coveragePct: number;
    uniqueCrashes: number;
    series: CorpusStatPoint[];
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

/**
 * Data point for chart rendering (one per day bucket).
 */
export interface CrashTrendPoint {
    /** ISO date (YYYY-MM-DD) */
    date: string;
    /** Signature counts keyed by signature identifier */
    [signatureKey: string]: string | number;
}

/** Outcome of a single contract call within a run's call sequence. */
export type ContractCallStatus = 'success' | 'failed' | 'pending';

/**
 * A single contract-to-contract call captured during a run, in the order it
 * occurred. Used to render the run's sequence diagram.
 */
export interface ContractCallStep {
    /** Stable identifier for this call within the run */
    id: string;
    /** 1-based position of this call in the run's overall call order */
    sequence: number;
    /** Contract or account that initiated the call */
    caller: string;
    /** Contract that was invoked */
    callee: string;
    /** Invoked method/function name */
    method: string;
    /** Nesting depth; 0 is a top-level call from the fuzz harness */
    depth: number;
    /** Outcome of this specific call */
    status: ContractCallStatus;
    /** Elapsed time for this call, in milliseconds */
    durationMs: number;
}

export type LedgerChangeType = 'created' | 'updated' | 'deleted';

export interface LedgerStateChange {
    id: string;
    entryType: string;
    changeType: LedgerChangeType;
    before?: string;
    after?: string;
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

/**
 * Content type for artifact file preview.
 * Determines how the artifact content is rendered in the preview modal.
 */
export type ContentType = 'json' | 'text' | 'hex' | 'unknown';

/**
 * A stored fuzzing artifact as displayed in the artifact explorer and
 * preview modal.
 */
export interface Artifact {
    id: string;
    name: string;
    type: ArtifactType;
    /** Size in bytes */
    size: number;
    /** ISO 8601 timestamp */
    updatedAt: string;
    createdAt?: string;
    runId?: string;
    content_hash?: string;
    /**
     * Detected content type for file preview (json, text, hex).
     * When absent, the preview falls back to the artifact type.
     */
    contentType?: ContentType;
}
