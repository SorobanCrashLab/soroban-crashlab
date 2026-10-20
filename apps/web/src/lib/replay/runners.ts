/**
 * lib/replay/runners — the three replay execution modes W5-A06 allows (#1876).
 *
 * The UI offers exactly these; anything else in a request body is rejected
 * before a job is created. Keeping the list here (not in the form) means the
 * API, the trigger and the tests cannot drift apart.
 */

export const REPLAY_RUNNERS = ['mock', 'host', 'rpc-sim'] as const;
export type ReplayRunner = (typeof REPLAY_RUNNERS)[number];

export const DEFAULT_REPLAY_RUNNER: ReplayRunner = 'host';

export interface ReplayRunnerInfo {
  id: ReplayRunner;
  label: string;
  description: string;
  /** Whether this runner produces real engine output. */
  executesEngine: boolean;
}

export const REPLAY_RUNNER_INFO: Record<ReplayRunner, ReplayRunnerInfo> = {
  mock: {
    id: 'mock',
    label: 'Mock runner',
    description: 'Deterministic in-process replay. Fast, no external toolchain, safe for demos and CI.',
    executesEngine: false,
  },
  host: {
    id: 'host',
    label: 'Host runner',
    description: 'Runs the local crashlab binary against the bundle. Requires the Rust workspace on PATH.',
    executesEngine: true,
  },
  'rpc-sim': {
    id: 'rpc-sim',
    label: 'RPC simulator',
    description: 'Replays through the Soroban RPC simulator. Requires a configured RPC endpoint.',
    executesEngine: true,
  },
};

export function isReplayRunner(value: unknown): value is ReplayRunner {
  return typeof value === 'string' && (REPLAY_RUNNERS as readonly string[]).includes(value);
}

/**
 * Parses a requested runner. Missing/blank means the default; an unknown value
 * is a hard error (the caller returns 400) rather than a silent fallback,
 * because silently running the host binary when the UI asked for the simulator
 * would misattribute results.
 */
export function parseReplayRunner(value: unknown): ReplayRunner | null {
  if (value === undefined || value === null) return DEFAULT_REPLAY_RUNNER;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_REPLAY_RUNNER;
  return isReplayRunner(trimmed) ? trimmed : null;
}
