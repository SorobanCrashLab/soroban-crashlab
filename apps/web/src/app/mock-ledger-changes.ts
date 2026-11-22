/**
 * Deterministic ledger state-change fixtures for the run detail diff view (#1119).
 *
 * The run detail page previously rendered one hard-coded set of three entries
 * for every run, so the diff looked identical no matter which run you opened.
 * These fixtures derive from the run itself, so the before/after ledger a run
 * shows actually corresponds to what that run exercised.
 *
 * As with `mockRuns`, this stands in for the Rust backend until the live API
 * serves ledger footprints; the shape matches `LedgerStateChange`.
 */

import type { FuzzingRun, LedgerStateChange, RunArea } from './types';

/**
 * Stable numeric seed for a run. Uses the trailing digits of the run id
 * (`run-1017` → 1017) and falls back to a character sum for ids that carry no
 * number, so every run gets the same fixtures on every render.
 */
function seedFromRunId(runId: string): number {
    const trailingDigits = /(\d+)\s*$/.exec(runId);
    if (trailingDigits) return Number(trailingDigits[1]);

    let sum = 0;
    for (let i = 0; i < runId.length; i++) sum += runId.charCodeAt(i);
    return sum;
}

/** Builders keyed by product area, so a run's diff reflects what it touched. */
const AREA_ENTRIES: Record<RunArea, (seed: number) => LedgerStateChange[]> = {
    auth: (seed) => [
        {
            id: `token:allowance:GABCD${seed}:GXYZ${seed + 5}`,
            entryType: 'ContractData',
            changeType: 'updated',
            before: JSON.stringify({ amount: 1_000 + seed, expirationLedger: 500_000 + seed }),
            after: JSON.stringify({ amount: 0, expirationLedger: 500_000 + seed }),
        },
        {
            id: `token:authorized:GABCD${seed}`,
            entryType: 'ContractData',
            changeType: 'created',
            after: JSON.stringify({ authorized: true, grantedAtLedger: 500_000 + seed }),
        },
    ],
    state: (seed) => [
        {
            id: `vault:balance:GABCD${seed}`,
            entryType: 'ContractData',
            changeType: 'updated',
            before: JSON.stringify({ amount: 10_000 + seed, lastLedger: 500_000 + seed }),
            after: JSON.stringify({ amount: 9_800 + seed, lastLedger: 500_001 + seed }),
        },
        {
            id: `vault:position:GABCD${seed}`,
            entryType: 'ContractData',
            changeType: 'deleted',
            before: JSON.stringify({ shares: 42 + (seed % 17), lockedUntil: 500_500 + seed }),
        },
        {
            id: `GABCD${seed}`,
            entryType: 'Account',
            changeType: 'updated',
            before: JSON.stringify({ balance: '10000000', seqNum: String(180 + seed) }),
            after: JSON.stringify({ balance: '9800000', seqNum: String(181 + seed) }),
        },
    ],
    budget: (seed) => [
        {
            id: `router:swap-config:${seed}`,
            entryType: 'ContractData',
            changeType: 'updated',
            before: JSON.stringify({ cpuLimit: 100_000_000, memLimit: 41_943_040, retries: 0 }),
            after: JSON.stringify({ cpuLimit: 100_000_000, memLimit: 41_943_040, retries: 1 + (seed % 3) }),
        },
        {
            id: `router:code-ttl:${seed}`,
            entryType: 'Ttl',
            changeType: 'updated',
            before: JSON.stringify({ liveUntilLedgerSeq: 600_000 + seed }),
            after: JSON.stringify({ liveUntilLedgerSeq: 620_000 + seed }),
        },
    ],
    xdr: (seed) => [
        {
            id: `codec:raw-entry:${seed}`,
            entryType: 'ContractData',
            changeType: 'updated',
            // Deliberately not JSON: the diff view must fall back to comparing
            // raw payloads instead of claiming there were no field changes.
            before: `AAAAAgAAAAEAAAAB${seed.toString(16)}`,
            after: `AAAAAgAAAAEAAAAC${(seed + 1).toString(16)}`,
        },
        {
            id: `codec:schema-version:${seed}`,
            entryType: 'ContractData',
            changeType: 'created',
            after: JSON.stringify({ version: 2, encoding: 'xdr-base64' }),
        },
    ],
};

/**
 * Builds the ledger entries a run touched.
 *
 * Runs still in flight report no committed changes — their footprint is not
 * final yet — which also gives the diff view a natural empty state to render.
 */
export function buildLedgerChangesForRun(run: FuzzingRun): LedgerStateChange[] {
    if (run.status === 'running') return [];

    const seed = seedFromRunId(run.id);
    const entries = AREA_ENTRIES[run.area](seed);

    // A failed run additionally leaves the crash marker it wrote before panicking.
    if (run.status === 'failed' && run.crashDetail) {
        entries.push({
            id: `crashlab:last-failure:${seed}`,
            entryType: 'ContractData',
            changeType: 'created',
            after: JSON.stringify({
                category: run.crashDetail.failureCategory,
                signature: run.crashDetail.signature,
                severity: run.severity,
            }),
        });
    }

    return entries;
}
