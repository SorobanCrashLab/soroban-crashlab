/**
 * Replay Diff Viewer - Ledger state deltas between runs.
 * Structured field-level before→after comparison with type-aware formatting.
 */

import { LedgerStateChange, LedgerChangeType } from '../../app/types';

export interface RunSnapshot {
    runId: string;
    contractId: string;
    schemaHash: string;
    ledgerState: LedgerStateChange[];
    timestamp: string;
}

export type DiffOpType = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffOperation {
    type: DiffOpType;
    key: string;
    ledgerKey: string;
    entryType: string;
    changeType: LedgerChangeType;
    before?: unknown;
    after?: unknown;
    fieldDiffs?: DiffField[];
    depth: number;
    parseFailed: boolean;
}

export interface DiffField {
    key: string;
    type: DiffOpType;
    before?: unknown;
    after?: unknown;
    parseFailed: boolean;
}

export interface DiffResult {
    operations: DiffOperation[];
    summary: {
        total: number;
        added: number;
        removed: number;
        changed: number;
        unchanged: number;
    };
    comparability: {
        compatible: boolean;
        reason?: string;
    };
    metadata: {
        leftRunId: string;
        rightRunId: string;
        leftContractId: string;
        rightContractId: string;
        leftSchemaHash: string;
        rightSchemaHash: string;
        diffTimeMs: number;
    };
}

export interface ComparabilityCheck {
    compatible: boolean;
    reason?: string;
}

/**
 * Maximum recursion depth for nested map diffing.
 */
export const MAX_DIFF_DEPTH = 5;

/**
 * Size threshold for lazy detail fetching.
 */
export const LAZY_FETCH_THRESHOLD = 100;

/**
 * Checks if two runs are comparable for diffing.
 * Runs must share contract ID and schema hash.
 */
export function checkComparability(left: RunSnapshot, right: RunSnapshot): ComparabilityCheck {
    if (left.contractId !== right.contractId) {
        return {
            compatible: false,
            reason: `Contract ID mismatch: "${left.contractId}" vs "${right.contractId}"`,
        };
    }

    if (left.schemaHash !== right.schemaHash) {
        return {
            compatible: false,
            reason: `Schema hash mismatch: "${left.schemaHash}" vs "${right.schemaHash}"`,
        };
    }

    return { compatible: true };
}

/**
 * Parses a JSON value with type detection.
 */
function parseValue(raw: string | undefined): { value: unknown; type: string; parseFailed: boolean } {
    if (raw === undefined || raw === '') {
        return { value: null, type: 'null', parseFailed: false };
    }

    try {
        const parsed = JSON.parse(raw);
        let type: string = typeof parsed;
        if (parsed === null) type = 'null';
        else if (Array.isArray(parsed)) type = 'array';
        else if (typeof parsed === 'object') type = 'object';
        return { value: parsed, type, parseFailed: false };
    } catch {
        // Check if it looks like hex bytes
        if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
            return { value: raw, type: 'bytes', parseFailed: false };
        }
        return { value: raw, type: 'string', parseFailed: true };
    }
}

/**
 * Formats a value for display based on its type.
 */
export function formatDiffValue(value: unknown, type: string, maxLength: number = 200): string {
    if (value === null) return '(null)';
    
    switch (type) {
        case 'number':
            return typeof value === 'number' ? value.toString() : String(value);
        case 'boolean':
            return value ? 'true' : 'false';
        case 'string':
            const str = String(value);
            return str.length > maxLength ? str.substring(0, maxLength) + '…' : str;
        case 'bytes':
            const bytes = String(value);
            return bytes.length > maxLength ? bytes.substring(0, maxLength) + '…' : bytes;
        case 'object':
        case 'array':
            try {
                const json = JSON.stringify(value, null, 2);
                return json.length > maxLength ? json.substring(0, maxLength) + '…' : json;
            } catch {
                return '[unserializable]';
            }
        default:
            return String(value);
    }
}

/**
 * Computes numeric delta for numeric values.
 */
export function computeNumericDelta(before: unknown, after: unknown): { delta: number; hasDelta: boolean } {
    const beforeNum = typeof before === 'number' ? before : parseFloat(String(before));
    const afterNum = typeof after === 'number' ? after : parseFloat(String(after));
    
    if (isNaN(beforeNum) || isNaN(afterNum)) {
        return { delta: 0, hasDelta: false };
    }
    
    return { delta: afterNum - beforeNum, hasDelta: true };
}

/**
 * Deep diffs two objects with depth limiting.
 */
function diffObjects(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    depth: number
): { fields: DiffField[]; parseFailed: boolean } {
    if (depth > MAX_DIFF_DEPTH) {
        return {
            fields: [],
            parseFailed: true,
        };
    }

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const fields: DiffField[] = [];
    let parseFailed = false;

    for (const key of allKeys) {
        const inBefore = Object.prototype.hasOwnProperty.call(before, key);
        const inAfter = Object.prototype.hasOwnProperty.call(after, key);

        if (!inBefore && inAfter) {
            const { parseFailed: pf } = parseValue(JSON.stringify(after[key]));
            fields.push({
                key,
                type: 'added',
                after: after[key],
                parseFailed: pf,
            });
            if (pf) parseFailed = true;
        } else if (inBefore && !inAfter) {
            const { parseFailed: pf } = parseValue(JSON.stringify(before[key]));
            fields.push({
                key,
                type: 'removed',
                before: before[key],
                parseFailed: pf,
            });
            if (pf) parseFailed = true;
        } else {
            const beforeVal = before[key];
            const afterVal = after[key];
            const beforeStr = JSON.stringify(beforeVal);
            const afterStr = JSON.stringify(afterVal);

            if (beforeStr !== afterStr) {
                // Both objects - recurse if both are objects
                if (
                    beforeVal !== null &&
                    afterVal !== null &&
                    typeof beforeVal === 'object' &&
                    typeof afterVal === 'object' &&
                    !Array.isArray(beforeVal) &&
                    !Array.isArray(afterVal)
                ) {
                    const nested = diffObjects(
                        beforeVal as Record<string, unknown>,
                        afterVal as Record<string, unknown>,
                        depth + 1
                    );
                    fields.push({
                        key,
                        type: 'changed',
                        before: beforeVal,
                        after: afterVal,
                        parseFailed: nested.parseFailed,
                    });
                    if (nested.parseFailed) parseFailed = true;
                } else {
                    const { parseFailed: pf } = parseValue(afterStr);
                    fields.push({
                        key,
                        type: 'changed',
                        before: beforeVal,
                        after: afterVal,
                        parseFailed: pf,
                    });
                    if (pf) parseFailed = true;
                }
            } else {
                fields.push({
                    key,
                    type: 'unchanged',
                    before: beforeVal,
                    parseFailed: false,
                });
            }
        }
    }

    return { fields, parseFailed };
}

/**
 * Diffs two ledger state snapshots.
 * Uses sorted-merge walk for O(n log n) performance.
 */
export function diffLedgerSnapshots(
    left: RunSnapshot,
    right: RunSnapshot
): DiffResult {
    const startTime = performance.now();

    // Check comparability
    const comparability = checkComparability(left, right);
    if (!comparability.compatible) {
        return {
            operations: [],
            summary: { total: 0, added: 0, removed: 0, changed: 0, unchanged: 0 },
            comparability,
            metadata: {
                leftRunId: left.runId,
                rightRunId: right.runId,
                leftContractId: left.contractId,
                rightContractId: right.contractId,
                leftSchemaHash: left.schemaHash,
                rightSchemaHash: right.schemaHash,
                diffTimeMs: performance.now() - startTime,
            },
        };
    }

    // Build keyed maps for sorted-merge walk
    const leftMap = new Map(left.ledgerState.map(e => [e.id, e]));
    const rightMap = new Map(right.ledgerState.map(e => [e.id, e]));

    const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const sortedKeys = [...allKeys].sort();

    const operations: DiffOperation[] = [];
    let added = 0, removed = 0, changed = 0, unchanged = 0;

    for (const key of sortedKeys) {
        const leftEntry = leftMap.get(key);
        const rightEntry = rightMap.get(key);

        if (!leftEntry && rightEntry) {
            // Added
            const { value: afterVal, parseFailed } = parseValue(rightEntry.after);
            operations.push({
                type: 'added',
                key: rightEntry.id,
                ledgerKey: key,
                entryType: rightEntry.entryType,
                changeType: rightEntry.changeType,
                after: afterVal,
                depth: 0,
                parseFailed,
            });
            added++;
        } else if (leftEntry && !rightEntry) {
            // Removed
            const { value: beforeVal, parseFailed } = parseValue(leftEntry.before);
            operations.push({
                type: 'removed',
                key: leftEntry.id,
                ledgerKey: key,
                entryType: leftEntry.entryType,
                changeType: leftEntry.changeType,
                before: beforeVal,
                depth: 0,
                parseFailed,
            });
            removed++;
        } else if (leftEntry && rightEntry) {
            // Both exist - compare
            const beforeParsed = parseValue(leftEntry.before);
            const afterParsed = parseValue(rightEntry.after);

            const { fields, parseFailed } = diffObjects(
                beforeParsed.parseFailed ? {} : (beforeParsed.value as Record<string, unknown>),
                afterParsed.parseFailed ? {} : (afterParsed.value as Record<string, unknown>),
                1
            );

            const fieldChanges = fields.filter(f => f.type !== 'unchanged').length;
            
            let opType: DiffOpType;
            if (fieldChanges === 0 && leftEntry.changeType === rightEntry.changeType) {
                opType = 'unchanged';
                unchanged++;
            } else if (leftEntry.changeType === 'created' && rightEntry.changeType === 'created') {
                opType = 'added';
                added++;
            } else if (leftEntry.changeType === 'deleted' && rightEntry.changeType === 'deleted') {
                opType = 'removed';
                removed++;
            } else {
                opType = 'changed';
                changed++;
            }

            operations.push({
                type: opType,
                key: leftEntry.id,
                ledgerKey: key,
                entryType: leftEntry.entryType,
                changeType: rightEntry.changeType,
                before: beforeParsed.value,
                after: afterParsed.value,
                fieldDiffs: fields.length > 0 ? fields : undefined,
                depth: 0,
                parseFailed: beforeParsed.parseFailed || afterParsed.parseFailed || parseFailed,
            });
        }
    }

    const diffTimeMs = performance.now() - startTime;

    return {
        operations,
        summary: { total: operations.length, added, removed, changed, unchanged },
        comparability: { compatible: true },
        metadata: {
            leftRunId: left.runId,
            rightRunId: right.runId,
            leftContractId: left.contractId,
            rightContractId: right.contractId,
            leftSchemaHash: left.schemaHash,
            rightSchemaHash: right.schemaHash,
            diffTimeMs,
        },
    };
}

/**
 * Filters operations by type.
 */
export function filterOperations(
    operations: DiffOperation[],
    filter: 'all' | DiffOpType
): DiffOperation[] {
    if (filter === 'all') return operations;
    return operations.filter(op => op.type === filter);
}

/**
 * Summarizes operations by type.
 */
export interface OperationSummary {
    total: number;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
}

export function summarizeOperations(operations: DiffOperation[]): OperationSummary {
    const summary: OperationSummary = { total: 0, added: 0, removed: 0, changed: 0, unchanged: 0 };
    for (const op of operations) {
        summary.total++;
        summary[op.type]++;
    }
    return summary;
}

/**
 * Creates a mock run snapshot for testing.
 */
export function createMockSnapshot(
    runId: string,
    contractId: string = 'contract-123',
    schemaHash: string = 'sha256:abc123',
    overrides: Partial<RunSnapshot> = {}
): RunSnapshot {
    return {
        runId,
        contractId,
        schemaHash,
        timestamp: new Date().toISOString(),
        ledgerState: [
            {
                id: `key-${runId}-1`,
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ balance: 1000, nonce: 5 }),
                after: JSON.stringify({ balance: 1100, nonce: 6 }),
            },
            {
                id: `key-${runId}-2`,
                entryType: 'ContractData',
                changeType: 'created',
                after: JSON.stringify({ allowance: 5000, spender: 'addr-456' }),
            },
            {
                id: `key-${runId}-3`,
                entryType: 'ContractData',
                changeType: 'deleted',
                before: JSON.stringify({ oldField: 'value' }),
            },
        ],
        ...overrides,
    };
}