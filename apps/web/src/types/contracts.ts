/**
 * Contract-specific shared types.
 *
 * Single source of truth for types that model Soroban smart-contract
 * execution from the web app's perspective: auth modes, contract-call
 * sequences, and ledger state changes. Anything that describes a contract
 * invocation or a ledger entry lives here so pages, components, and lib
 * modules all consume the same definition instead of re-declaring their own.
 *
 * These types are re-exported from `types/index.ts` (and, transitively, from
 * `app/types.ts`) for backward compatibility.
 */

/** The three Soroban authorization modes used by the auth-matrix runner. */
export type SorobanAuthMode = 'Enforce' | 'Record' | 'RecordAllowNonroot';

export type ContractCallStatus = 'success' | 'failed' | 'pending';

export interface ContractCallStep {
  id: string;
  sequence: number;
  caller: string;
  callee: string;
  method: string;
  depth: number;
  status: ContractCallStatus;
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

/** The contract + method a run's crash payload identifies, if parseable. */
export interface ContractCallInfo {
  contract: string;
  method: string;
}

/** Per-(contract, method) resource-fee grouping used by the resource-fee panels. */
export interface ContractCallFeeSummary {
  contract: string;
  method: string;
  runCount: number;
  maxFee: number;
  avgFee: number;
  maxCpu: number;
  representativeRunId: string;
}

/** Field-level comparison of a ledger entry's before/after payloads. */
export interface LedgerFieldDiff {
  /** Keys present only in `after`. */
  added: Record<string, unknown>;
  /** Keys present only in `before`. */
  removed: Record<string, unknown>;
  /** Keys present in both, with different values. */
  changed: Record<string, { before: unknown; after: unknown }>;
  /** Keys present in both with identical values. */
  unchanged: Record<string, unknown>;
  /**
   * True when at least one side was non-empty but could not be read as a JSON
   * object. The caller should fall back to comparing the raw strings rather
   * than claiming there were no field changes.
   */
  parseFailed: boolean;
}
