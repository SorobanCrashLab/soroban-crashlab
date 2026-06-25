/**
 * buildMockRuns – deterministic mock dataset for the fuzzing-run dashboard.
 *
 * Schema alignment (ROADMAP-042)
 * ─────────────────────────────
 * The shape of every `FuzzingRun` object produced here is deliberately kept in
 * sync with what the Rust `crashlab-core` backend emits over the REST API:
 *
 *  Rust type                  → TS field
 *  ─────────────────────────────────────
 *  CrashGroupRecord.signature_hash → crashDetail.signatureHash  (FNV-1a u64, JS number)
 *  CrashGroupRecord.category       → crashDetail.failureCategory
 *  RunSummary.seeds_processed      → seedCount      (approximation until live API)
 *  RunTerminalState variants       → status         ('completed'|'failed'|'cancelled'|'running')
 *
 * `RUNS_API_URL` env var (documented in apps/web/.env.example) overrides this
 * fixture with real backend data when set.
 */

import { FuzzingRun, RunArea, RunIssueLink, RunSeverity, RunStatus } from './types';

// ─── FNV-1a hash (matches Rust's crashlab_core::signature_hash::hash_category_payload) ───

/**
 * Computes a 32-bit FNV-1a hash of `category` followed by `payload`.
 *
 * The Rust backend uses a 64-bit variant; JavaScript's `number` type is a
 * double-precision float, so we use 32-bit arithmetic to stay within safe
 * integer range (2^53 − 1) without BigInt.  The same category+payload pair
 * always produces the same value — equivalent failures share the same hash.
 *
 * @param category  Failure category string (e.g. "auth", "budget").
 * @param payload   Arbitrary payload string used as additional discriminator.
 * @returns         Unsigned 32-bit integer in the safe JS number range.
 */
export function computeSignatureHash(category: string, payload: string): number {
  // FNV-1a 32-bit constants
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET = 0x811c9dc5;

  let hash = FNV_OFFSET;
  const input = category + '\0' + payload; // null-separated like the Rust impl

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply, keeping within 32-bit unsigned range
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash;
}

// ─── Failure scenario catalogue ───────────────────────────────────────────────

/**
 * Represents a deterministic failure scenario sourced from the Rust crash index.
 * Fields mirror the `CrashGroupRecord` produced by `CrashIndex::summary()`.
 */
interface FailureScenario {
  area: RunArea;
  severity: RunSeverity;
  /** Maps to CrashGroupRecord.category */
  failureCategory: string;
  /** Human-readable stable identifier (the string key used in issue catalogs). */
  signature: string;
  contract: string;
  method: string;
}

const failureScenarios: FailureScenario[] = [
  {
    area: 'auth',
    severity: 'high',
    failureCategory: 'InvariantViolation',
    signature: 'sig:token:transfer:assert_balance_nonnegative',
    contract: 'token',
    method: 'transfer',
  },
  {
    area: 'state',
    severity: 'critical',
    failureCategory: 'Panic',
    signature: 'sig:vault:rebalance:unwrap_budget_snapshot',
    contract: 'vault',
    method: 'rebalance',
  },
  {
    area: 'budget',
    severity: 'medium',
    failureCategory: 'BudgetExceeded',
    signature: 'sig:router:swap:budget_cpu_limit',
    contract: 'router',
    method: 'swap',
  },
];

// Pre-compute a signatureHash for each scenario so failed runs carry the same
// stable hash the Rust CrashIndex would assign to that failure class.
const scenarioHashes: number[] = failureScenarios.map((s) =>
  computeSignatureHash(s.failureCategory, s.signature),
);

// ─── Static lookup tables ─────────────────────────────────────────────────────

const fallbackAreas: RunArea[] = ['auth', 'state', 'budget', 'xdr'];
const fallbackSeverities: RunSeverity[] = ['low', 'medium', 'high', 'critical'];

/**
 * Status cycle mirrors `RunTerminalState` from Rust's `run_control.rs`.
 * 'running' represents an in-progress run (no terminal state yet).
 * The distribution is intentionally skewed toward 'failed' to exercise the
 * crash-detail code path in tests and UI components.
 */
const statuses: RunStatus[] = ['completed', 'failed', 'running', 'cancelled', 'failed'];

/**
 * Issue links keyed by the stable signature string.
 * Matches the `associatedIssues` field in `FuzzingRun`.
 */
const issueCatalog: Record<string, RunIssueLink[]> = {
  'sig:token:transfer:assert_balance_nonnegative': [
    {
      label: '#53 Run issue jump links',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/53',
    },
    {
      label: '#61 Transfer invariant follow-up',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/61',
    },
  ],
  'sig:vault:rebalance:unwrap_budget_snapshot': [
    {
      label: '#47 Vault rebalance panic',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/47',
    },
  ],
  'sig:router:swap:budget_cpu_limit': [
    {
      label: '#52 Status timeline for budget failures',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/52',
    },
    {
      label: '#55 Run heatmap for expensive swaps',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/55',
    },
  ],
};

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Builds a deterministic list of 25 mock `FuzzingRun` objects.
 *
 * The returned dataset is aligned with the Rust backend's index schema:
 * - `crashDetail.signatureHash` is a FNV-1a hash matching `CrashGroupRecord.signature_hash`.
 * - `status` values map to `RunTerminalState` variants (`completed`, `failed`, `cancelled`)
 *   plus the in-progress sentinel `'running'`.
 * - Non-failed runs always carry `crashDetail: null`, matching backend contract.
 * - Failed runs always carry a non-null `crashDetail` with all required fields.
 *
 * Returned in reverse-chronological order (newest first) so UI components that
 * slice from the front show the most recent activity.
 */
export function buildMockRuns(): FuzzingRun[] {
  return Array.from({ length: 25 }, (_, index) => {
    const id = 1000 + index;
    const status = statuses[index % statuses.length];
    const scenarioIndex = index % failureScenarios.length;
    const failureScenario = failureScenarios[scenarioIndex];

    const area =
      status === 'failed'
        ? failureScenario.area
        : fallbackAreas[index % fallbackAreas.length];

    const severity =
      status === 'failed'
        ? failureScenario.severity
        : fallbackSeverities[index % fallbackSeverities.length];

    // Timestamps — spread across a 36-minute window per run starting 2026-03-01
    const baseDate = new Date(Date.UTC(2026, 2, 1, 8, 0, 0) + index * 36 * 60 * 1000);
    const queuedAt = baseDate.toISOString();
    const startedAt = new Date(baseDate.getTime() + 15_000).toISOString();
    const duration = 120_000 + index * 95_000;
    const finishedAt =
      status === 'running'
        ? undefined
        : new Date(baseDate.getTime() + 15_000 + duration).toISOString();

    const signature = failureScenario.signature;

    // signatureHash: stable FNV-1a hash matching Rust's compute_signature_hash().
    // Only failed runs surface this in their crashDetail; the value is always
    // pre-computed so dashboards can de-duplicate by hash without a backend call.
    const signatureHash = scenarioHashes[scenarioIndex];

    return {
      id: `run-${id}`,
      status,
      area,
      severity,
      duration,
      // seedCount approximates RunSummary.seeds_processed from the Rust backend
      seedCount: 10_000 + index * 1_250,
      cpuInstructions: 450_000 + index * 28_500,
      memoryBytes: 1_800_000 + index * 230_000,
      minResourceFee: 600 + index * 170,
      queuedAt,
      startedAt,
      finishedAt,
      crashDetail:
        status === 'failed'
          ? {
              failureCategory: failureScenario.failureCategory,
              signature,
              // Index-aligned stable hash (CrashGroupRecord.signature_hash)
              signatureHash,
              payload: JSON.stringify(
                {
                  contract: failureScenario.contract,
                  method: failureScenario.method,
                  args: {
                    from: `GABCD...${id}`,
                    to: `GXYZ...${id + 5}`,
                    amount: 1000 + index * 97,
                  },
                },
                null,
                2,
              ),
              replayAction: `cargo run --bin crash-replay -- --run-id run-${id}`,
            }
          : null,
      associatedIssues: status === 'failed' ? (issueCatalog[signature] ?? []) : [],
      annotations:
        index % 5 === 0 ? ['Verified by maintainer', 'Related to contract state exhaustion'] : [],
      tags:
        index % 7 === 0
          ? ['needs-repro', 'partner-followup']
          : index % 4 === 0
            ? ['ship-blocker']
            : [],
    };
  }).reverse();
}
