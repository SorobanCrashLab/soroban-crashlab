/**
 * Status variants for a fuzzing run.
 */
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Interface representing a single fuzzing run.
 */
export interface FuzzingRun {
    /** Unique identifier for the run */
    id: string;
    /** Current state of the run */
    status: RunStatus;
    /** Total elapsed duration in milliseconds */
    duration: number;
    /** Number of seeds used/generated during the run */
    seedCount: number;
}
