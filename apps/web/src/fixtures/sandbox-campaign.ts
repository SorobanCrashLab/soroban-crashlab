/**
 * fixtures/sandbox-campaign — canned campaign for the landing demo (#1669).
 * Deterministic, dependency-free, derived from the real fixture shapes
 * (fixtures/runs.ts + rich-corpus-run.json). No network, no account.
 */

export interface SandboxFrame {
  t: number;
  seeds: number;
  execsPerSec: number;
  coveragePct: number;
  crashes: number;
  log: string;
}

export const SANDBOX_FRAMES: SandboxFrame[] = [
  { t: 0, seeds: 120, execsPerSec: 410, coveragePct: 12, crashes: 0, log: 'campaign started · token::transfer × 64 seeds' },
  { t: 1, seeds: 480, execsPerSec: 620, coveragePct: 28, crashes: 0, log: 'mutating amounts · edge: u64::MAX' },
  { t: 2, seeds: 1120, execsPerSec: 780, coveragePct: 41, crashes: 0, log: 'dictionary insert · from/to auth pairs' },
  { t: 3, seeds: 1980, execsPerSec: 840, coveragePct: 55, crashes: 0, log: 'havoc stage · 2.1k execs' },
  { t: 4, seeds: 3120, execsPerSec: 910, coveragePct: 63, crashes: 1, log: 'crash: InvariantViolation sig:token:transfer' },
  { t: 5, seeds: 4290, execsPerSec: 880, coveragePct: 71, crashes: 1, log: 'dedup by signatureHash · 1 group' },
  { t: 6, seeds: 5210, execsPerSec: 860, coveragePct: 74, crashes: 1, log: 'reproducer ready · cargo run --bin crash-replay' },
];

export const SANDBOX_CRASH = {
  signature: 'sig:token:transfer:assert_balance_nonnegative',
  failureCategory: 'InvariantViolation',
  reproducer: 'cargo run --bin crash-replay -- --run-id run-demo-001',
} as const;
