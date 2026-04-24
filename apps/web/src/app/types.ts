/**
 * Status variants for a fuzzing run.
 */
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
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

export type LedgerChangeType = 'created' | 'updated' | 'deleted';

export interface LedgerStateChange {
    id: string;
    entryType: string;
    changeType: LedgerChangeType;
    before?: string;
    after?: string;
}
