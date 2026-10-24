/**
 * lib/replay/environment — fingerprint mismatch pre-flight (W5-B08, #1876).
 *
 * A replay against a different engine build, contract hash or network config
 * is not a reproduction — it is a new experiment wearing the same label. The
 * comparison is explicit: a mismatch blocks the run until the caller
 * acknowledges it, and the acknowledgement is recorded on the job.
 *
 * "Unknown" is a real state: if neither side has a stamp there is nothing to
 * compare, and inventing a mismatch would train users to click through warnings.
 */

export interface ReplayEnvironment {
  engineVersion?: string;
  contractWasmHash?: string;
  networkConfigHash?: string;
  seedSet?: string;
}

export type EnvironmentStatus = 'match' | 'mismatch' | 'unknown';

export interface EnvironmentMismatch {
  field: keyof ReplayEnvironment;
  expected: string;
  actual: string;
}

export interface EnvironmentCheck {
  status: EnvironmentStatus;
  mismatches: EnvironmentMismatch[];
  /** The caller explicitly accepted a mismatch. */
  acknowledged: boolean;
  /** True when a mismatch must be acknowledged before the run may proceed. */
  requiresAcknowledgement: boolean;
  /** Human summary for the inline warning. */
  summary: string;
}

const FIELDS: Array<keyof ReplayEnvironment> = [
  'engineVersion',
  'contractWasmHash',
  'networkConfigHash',
  'seedSet',
];

const FIELD_LABELS: Record<keyof ReplayEnvironment, string> = {
  engineVersion: 'engine version',
  contractWasmHash: 'contract WASM hash',
  networkConfigHash: 'network config',
  seedSet: 'seed set',
};

function hasAnyField(value: ReplayEnvironment | undefined): value is ReplayEnvironment {
  if (!value) return false;
  return FIELDS.some((field) => typeof value[field] === 'string' && value[field]!.trim().length > 0);
}

/**
 * Compares the environment the crash was recorded in (`expected`) with the one
 * the replay will run in (`actual`). Only fields present on both sides are
 * compared; a missing value is unknown, not a mismatch.
 */
export function compareReplayEnvironments(
  expected: ReplayEnvironment | undefined,
  actual: ReplayEnvironment | undefined,
  acknowledged = false,
): EnvironmentCheck {
  if (!hasAnyField(expected) || !hasAnyField(actual)) {
    return {
      status: 'unknown',
      mismatches: [],
      acknowledged: false,
      requiresAcknowledgement: false,
      summary: 'No environment fingerprint is recorded for this run, so no mismatch can be detected.',
    };
  }

  const mismatches: EnvironmentMismatch[] = [];
  for (const field of FIELDS) {
    const left = expected[field]?.trim();
    const right = actual[field]?.trim();
    if (!left || !right) continue;
    if (left !== right) {
      mismatches.push({ field, expected: left, actual: right });
    }
  }

  if (mismatches.length === 0) {
    return {
      status: 'match',
      mismatches: [],
      acknowledged: false,
      requiresAcknowledgement: false,
      summary: 'The replay environment matches the run that produced this crash.',
    };
  }

  const summary = `The replay environment differs from the recorded crash (${mismatches
    .map((mismatch) => FIELD_LABELS[mismatch.field])
    .join(', ')}). Results may not reproduce the original failure.`;

  return {
    status: 'mismatch',
    mismatches,
    acknowledged,
    requiresAcknowledgement: !acknowledged,
    summary,
  };
}

/** True when a job may proceed given the check and the caller's acknowledgement. */
export function mayRunReplay(check: EnvironmentCheck): boolean {
  return check.status !== 'mismatch' || check.acknowledged;
}

/** Parses a client-supplied environment object without trusting its shape. */
export function parseReplayEnvironment(value: unknown): ReplayEnvironment | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const parsed: ReplayEnvironment = {};
  for (const field of FIELDS) {
    const raw = record[field];
    if (typeof raw === 'string' && raw.trim()) parsed[field] = raw.trim().slice(0, 256);
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}
