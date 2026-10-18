/*
 * Readable state diff model (#1119).
 *
 * Turns raw trace storage events into a typed, grouped, renderable diff model.
 * The decoding of values lives in `decode.ts` and the presentation in
 * `format.ts`; this module only orchestrates them into the model the UI consumes.
 */

import {
  decodeStorageEntryKey,
  decodeStorageValue,
  type DecodedKey,
  type DecodedValue,
} from './decode';

/** Classification of a storage entry between two snapshots. */
export type StateDiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/** Kind of ledger entry the event describes. */
export type StateDiffEntryType = 'contractData' | 'contractCode' | 'ttl' | 'unknown';

/** Raw storage event as present in an execution trace. */
export interface TraceStorageEvent {
  /** Stellar event type, e.g. `contract_data_created`. */
  readonly type?: string;
  /** Contract address (C...) the entry belongs to. */
  readonly contractId?: string;
  /** Base64 or hex encoded ledger key. */
  readonly key?: string;
  /** Base64 or hex encoded value before the invocation. */
  readonly before?: string | null;
  /** Base64 or hex encoded value after the invocation. */
  readonly after?: string | null;
  /** Optional TTL extension details. */
  readonly ttlBase?: number;
  readonly ttlBefore?: number;
  readonly ttlAfter?: number;
}

/** One renderable diff row. */
export interface StateDiffEntry {
  /** Stable identifier for React keys and filtering. */
  id: string;
  contractId: string;
  entryType: StateDiffEntryType;
  changeType: StateDiffChangeType;
  key: DecodedKey;
  before: DecodedValue | null;
  after: DecodedValue | null;
  /** Numeric delta when both sides are integers, otherwise null. */
  delta: bigint | null;
  /** True when any side could not be decoded. */
  undecodable: boolean;
}

/** Entries grouped by contract. */
export interface StateDiffGroup {
  contractId: string;
  entries: StateDiffEntry[];
  summary: StateDiffSummary;
}

/** Per-contract and overall counts for the summary strip. */
export interface StateDiffSummary {
  total: number;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  undecodable: number;
}

/** Net balance movement across all integer entries. */
export interface StateDiffNetBalance {
  /** Sum of integer deltas across all entries. */
  totalDelta: bigint;
  /** Number of entries that contributed a numeric delta. */
  contributing: number;
}

/** Top-level diff model consumed by the panel. */
export interface StateDiffModel {
  groups: StateDiffGroup[];
  summary: StateDiffSummary;
  netBalance: StateDiffNetBalance;
  /** True when the trace had no storage events at all (pure view call). */
  isEmpty: boolean;
}

const EMPTY_SUMMARY: StateDiffSummary = {
  total: 0,
  added: 0,
  removed: 0,
  modified: 0,
  unchanged: 0,
  undecodable: 0,
};

function emptySummary(): StateDiffSummary {
  return { ...EMPTY_SUMMARY };
}

function addToSummary(summary: StateDiffSummary, entry: StateDiffEntry): void {
  summary.total += 1;
  if (entry.changeType === 'added') summary.added += 1;
  else if (entry.changeType === 'removed') summary.removed += 1;
  else if (entry.changeType === 'modified') summary.modified += 1;
  else summary.unchanged += 1;
  if (entry.undecodable) summary.undecodable += 1;
}

/** Maps a raw event type string to a normalized entry type. */
export function classifyEntryType(type: string | undefined): StateDiffEntryType {
  if (!type) return 'unknown';
  const normalized = type.toLowerCase();
  if (normalized.includes('code')) return 'contractCode';
  if (normalized.includes('ttl')) return 'ttl';
  if (normalized.includes('data')) return 'contractData';
  return 'unknown';
}

/** Derives the change classification from the presence of before/after. */
export function classifyChange(
  before: string | null | undefined,
  after: string | null | undefined,
): StateDiffChangeType {
  const hasBefore = before != null && before !== '';
  const hasAfter = after != null && after !== '';
  if (!hasBefore && hasAfter) return 'added';
  if (hasBefore && !hasAfter) return 'removed';
  if (!hasBefore && !hasAfter) return 'unchanged';
  return before === after ? 'unchanged' : 'modified';
}

function computeDelta(
  before: DecodedValue | null,
  after: DecodedValue | null,
): bigint | null {
  const beforeIsInt = before === null || before.kind === 'int';
  const afterIsInt = after === null || after.kind === 'int';
  if (!beforeIsInt || !afterIsInt) return null;
  if (before === null && after === null) return null;
  const beforeInt = before !== null && before.kind === 'int' ? before.value : BigInt(0);
  const afterInt = after !== null && after.kind === 'int' ? after.value : BigInt(0);
  return afterInt - beforeInt;
}

/** Builds a single diff entry from a trace storage event. */
export function buildStateDiffEntry(
  event: TraceStorageEvent,
  index: number,
): StateDiffEntry {
  const contractId = event.contractId ?? 'unknown';
  const key = decodeStorageEntryKey(event.key);
  const before = decodeStorageValue(event.before);
  const after = decodeStorageValue(event.after);
  const changeType = classifyChange(event.before, event.after);
  const undecodable =
    (before !== null && before.kind === 'undecodable') ||
    (after !== null && after.kind === 'undecodable');

  return {
    id: `${contractId}:${index}:${key.raw}`,
    contractId,
    entryType: classifyEntryType(event.type),
    changeType,
    key,
    before,
    after,
    delta: computeDelta(before, after),
    undecodable,
  };
}

/** Builds the full grouped diff model from a trace's storage events. */
export function buildStateDiffModel(
  events: readonly TraceStorageEvent[],
): StateDiffModel {
  const byContract = new Map<string, StateDiffEntry[]>();
  const overall = emptySummary();
  let totalDelta = BigInt(0);
  let contributing = 0;

  events.forEach((event, index) => {
    const entry = buildStateDiffEntry(event, index);
    const bucket = byContract.get(entry.contractId);
    if (bucket) {
      bucket.push(entry);
    } else {
      byContract.set(entry.contractId, [entry]);
    }
    addToSummary(overall, entry);
    if (entry.delta !== null) {
      totalDelta += entry.delta;
      contributing += 1;
    }
  });

  const groups: StateDiffGroup[] = [];
  for (const [contractId, entries] of byContract) {
    const summary = emptySummary();
    for (const entry of entries) addToSummary(summary, entry);
    groups.push({ contractId, entries, summary });
  }

  groups.sort((a, b) => a.contractId.localeCompare(b.contractId));

  return {
    groups,
    summary: overall,
    netBalance: { totalDelta, contributing },
    isEmpty: events.length === 0,
  };
}
