/**
 * lib/replay/failure — plain-language replay failures (#1876).
 *
 * The three failures a user actually hits are not interchangeable:
 *
 *   bundle-missing      the run's artifact is gone — re-export it
 *   runner-unavailable  the toolchain is absent — install it or use mock
 *   environment-mismatch the replay is not the same experiment — acknowledge or fix it
 *
 * Each gets its own copy and a retry verdict, so the UI never shows a generic
 * "replay failed" for a problem the user could fix in one step.
 */

export type ReplayFailureReason =
  | 'bundle-missing'
  | 'runner-unavailable'
  | 'environment-mismatch'
  | 'mismatch'
  | 'timeout'
  | 'internal';

export interface ReplayFailure {
  reason: ReplayFailureReason;
  title: string;
  message: string;
  guidance: string;
  /** Whether running the same request again could plausibly succeed. */
  retryable: boolean;
}

const COPY: Record<ReplayFailureReason, Omit<ReplayFailure, 'reason'>> = {
  'bundle-missing': {
    title: 'Replay bundle is missing',
    message: 'The seed bundle for this crash could not be found, so there is nothing to replay.',
    guidance: 'Re-export the artifact from the run, then retry. If the run predates artifact retention, replay is no longer possible.',
    retryable: false,
  },
  'runner-unavailable': {
    title: 'Replay runner is unavailable',
    message: 'The selected runner is not installed or not reachable from this host.',
    guidance: 'Install the crashlab toolchain on the host, or switch to the mock runner to exercise the loop without external binaries.',
    retryable: false,
  },
  'environment-mismatch': {
    title: 'Environment fingerprint does not match',
    message: 'This host does not match the environment where the crash was recorded.',
    guidance: 'Compare engine version, contract WASM hash and network config. If you accept the difference, re-run with the override acknowledgement.',
    retryable: false,
  },
  mismatch: {
    title: 'Replay did not reproduce the crash',
    message: 'The runner completed, but the failure signature differs from the original crash.',
    guidance: 'Treat this as a lead, not a reproduction: attach the diagnostics to the issue and check whether the fix or the environment changed.',
    retryable: false,
  },
  timeout: {
    title: 'Replay timed out',
    message: 'The runner did not finish within the allowed time.',
    guidance: 'Retry once; if it times out again, narrow the seed set or run the bundle locally to see where it stalls.',
    retryable: true,
  },
  internal: {
    title: 'Replay failed',
    message: 'The runner exited with an unexpected error.',
    guidance: 'Copy the diagnostics into a problem report. The exit code and stderr are attached to the job.',
    retryable: true,
  },
};

export function describeReplayFailure(reason: ReplayFailureReason, detail?: string): ReplayFailure {
  const copy = COPY[reason];
  return {
    reason,
    ...copy,
    ...(detail?.trim() ? { message: `${copy.message} ${detail.trim()}` } : {}),
  };
}

export interface ReplayFailureInput {
  bundleMissing?: boolean;
  runnerMissing?: boolean;
  timedOut?: boolean;
  environmentMismatch?: boolean;
  stderr?: string;
  exitCode?: number;
}

/** Recognises the `ENOENT` shape Node throws when a binary is not installed. */
export function isRunnerUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Maps runner output to a failure, or `null` when the run succeeded. Order is
 * deliberate: an environment mismatch outranks a stderr that merely *mentions*
 * a mismatch, and a missing bundle outranks a generic non-zero exit.
 */
export function classifyReplayFailure(input: ReplayFailureInput): ReplayFailure | null {
  if (input.environmentMismatch) return describeReplayFailure('environment-mismatch');
  if (input.bundleMissing) return describeReplayFailure('bundle-missing');
  if (input.runnerMissing) return describeReplayFailure('runner-unavailable');
  if (input.timedOut) return describeReplayFailure('timeout');

  const stderr = input.stderr ?? '';
  if (/replay mismatch:|signature mismatch/i.test(stderr)) {
    return describeReplayFailure('mismatch');
  }
  if (input.exitCode !== undefined && input.exitCode !== 0) {
    return describeReplayFailure('internal', stderr.trim().slice(0, 400) || `Exit code ${input.exitCode}.`);
  }
  return null;
}
