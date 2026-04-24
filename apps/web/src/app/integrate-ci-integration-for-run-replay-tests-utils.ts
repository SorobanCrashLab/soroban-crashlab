/**
 * Issue #246 – Integrate: CI integration for run replay tests
 *
 * Pure utility functions extracted from CIIntegrationForRunReplayTests.
 * All functions are free of React or browser dependencies for deterministic testing.
 */

export type CIReplayStatus = 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'timeout';
export type SorobanAuthMode = 'Enforce' | 'Record' | 'RecordAllowNonroot';

export interface CIJobConfig {
  jobId: string;
  runner: string;
  authMode: SorobanAuthMode;
}

export interface CIJobResult {
  jobId: string;
  replayRunId: string;
  signatureMatch: boolean;
  durationMs: number;
  errorMessage?: string;
}

export interface CIReplayTestCase {
  id: string;
  label: string;
  description: string;
  sourceRunId: string;
  sourceSignature: string;
  jobs: CIJobConfig[];
  status: CIReplayStatus;
  results?: CIJobResult[];
}

/** Returns true when a test case is actively queued or running. */
export function isActiveStatus(status: CIReplayStatus): boolean {
  return status === 'queued' || status === 'running';
}

/** Returns true when a test case has reached a terminal state. */
export function isTerminalStatus(status: CIReplayStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'timeout';
}

/** Derives the overall test case status from a set of completed job results. */
export function deriveTestCaseStatus(results: CIJobResult[]): CIReplayStatus {
  if (results.length === 0) return 'failed';
  return results.every((r) => r.signatureMatch) ? 'passed' : 'failed';
}

export interface CIRunSummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  idle: number;
}

/** Aggregates test case counts into a summary. */
export function summariseCIRun(cases: CIReplayTestCase[]): CIRunSummary {
  return cases.reduce<CIRunSummary>(
    (acc, tc) => ({
      total: acc.total + 1,
      passed: acc.passed + (tc.status === 'passed' ? 1 : 0),
      failed: acc.failed + (tc.status === 'failed' || tc.status === 'timeout' ? 1 : 0),
      running: acc.running + (isActiveStatus(tc.status) ? 1 : 0),
      idle: acc.idle + (tc.status === 'idle' ? 1 : 0),
    }),
    { total: 0, passed: 0, failed: 0, running: 0, idle: 0 }
  );
}

export interface CIJobValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates a single CIJobConfig has all required env/config contract fields. */
export function validateJobConfig(job: CIJobConfig): CIJobValidation {
  const errors: string[] = [];
  if (!job.jobId) errors.push('jobId is required');
  if (!job.runner) errors.push('runner is required');
  const validModes: SorobanAuthMode[] = ['Enforce', 'Record', 'RecordAllowNonroot'];
  if (!validModes.includes(job.authMode)) {
    errors.push(`authMode must be one of: ${validModes.join(', ')}`);
  }
  return { isValid: errors.length === 0, errors };
}

/** Validates a completed CIJobResult for observable success criteria. */
export function validateJobResult(result: CIJobResult): CIJobValidation {
  const errors: string[] = [];
  if (!result.jobId) errors.push('jobId is required');
  if (!result.replayRunId) errors.push('replayRunId is required');
  if (result.durationMs < 0) errors.push('durationMs must be >= 0');
  if (!result.signatureMatch && !result.errorMessage) {
    errors.push('errorMessage is required when signatureMatch is false');
  }
  return { isValid: errors.length === 0, errors };
}

/** Returns all jobs across a test case that had signature mismatches. */
export function findMismatchedJobs(tc: CIReplayTestCase): CIJobResult[] {
  if (!tc.results) return [];
  return tc.results.filter((r) => !r.signatureMatch);
}

/** Returns true if all jobs in the test case used the same auth mode. */
export function allJobsSameAuthMode(jobs: CIJobConfig[]): boolean {
  if (jobs.length === 0) return true;
  const first = jobs[0].authMode;
  return jobs.every((j) => j.authMode === first);
}
