/**
 * Deterministic contract call-order fixtures for the run sequence diagram
 * view (#1126).
 *
 * There is no live API yet for the ordered call trace a run produced, so
 * these fixtures derive from the run itself the same way `mock-ledger-changes`
 * does: same run id always yields the same sequence, and the sequence
 * reflects the run's product area rather than one hard-coded trace for every
 * run.
 */

import type { ContractCallStatus, ContractCallStep, FuzzingRun, RunArea } from './types';

/**
 * Stable numeric seed for a run, shared with the ledger-change fixtures so a
 * given run id always produces the same synthetic data everywhere it's used.
 */
function seedFromRunId(runId: string): number {
    const trailingDigits = /(\d+)\s*$/.exec(runId);
    if (trailingDigits) return Number(trailingDigits[1]);

    let sum = 0;
    for (let i = 0; i < runId.length; i++) sum += runId.charCodeAt(i);
    return sum;
}

interface CallTemplate {
    caller: string;
    callee: string;
    method: string;
    depth: number;
}

/** Call chains keyed by product area, so a run's diagram reflects what it exercised. */
const AREA_CALLS: Record<RunArea, CallTemplate[]> = {
    auth: [
        { caller: 'harness', callee: 'token', method: 'transfer', depth: 0 },
        { caller: 'token', callee: 'account', method: 'require_auth', depth: 1 },
        { caller: 'token', callee: 'allowance', method: 'spend_allowance', depth: 1 },
    ],
    state: [
        { caller: 'harness', callee: 'vault', method: 'withdraw', depth: 0 },
        { caller: 'vault', callee: 'ledger', method: 'get_balance', depth: 1 },
        { caller: 'vault', callee: 'ledger', method: 'put_balance', depth: 1 },
        { caller: 'vault', callee: 'position', method: 'close_position', depth: 1 },
    ],
    budget: [
        { caller: 'harness', callee: 'router', method: 'swap', depth: 0 },
        { caller: 'router', callee: 'pool_a', method: 'quote', depth: 1 },
        { caller: 'router', callee: 'pool_b', method: 'execute_swap', depth: 1 },
        { caller: 'pool_b', callee: 'ledger', method: 'update_reserves', depth: 2 },
    ],
    xdr: [
        { caller: 'harness', callee: 'codec', method: 'decode_envelope', depth: 0 },
        { caller: 'codec', callee: 'codec', method: 'decode_operation', depth: 1 },
    ],
};

/** Every third call takes noticeably longer, so durations aren't all identical. */
function durationForIndex(seed: number, index: number): number {
    const base = 4 + ((seed + index * 7) % 40);
    return index % 3 === 0 ? base * 5 : base;
}

/**
 * Builds the ordered contract call sequence a run produced.
 *
 * A run still in flight has not committed a final trace, so it reports no
 * calls yet — this also gives the sequence diagram a natural empty state.
 * A failed run's last call is marked `failed` rather than `success`, so the
 * diagram highlights where the chain broke.
 */
export function buildCallSequenceForRun(run: FuzzingRun): ContractCallStep[] {
    if (run.status === 'running') return [];

    const seed = seedFromRunId(run.id);
    const templates = AREA_CALLS[run.area];

    return templates.map((template, index) => {
        const isLastCall = index === templates.length - 1;
        const status: ContractCallStatus =
            run.status === 'failed' && isLastCall ? 'failed' : 'success';

        return {
            id: `${run.id}:call:${index}`,
            sequence: index + 1,
            caller: template.caller,
            callee: template.callee,
            method: template.method,
            depth: template.depth,
            status,
            durationMs: durationForIndex(seed, index),
        };
    });
}
