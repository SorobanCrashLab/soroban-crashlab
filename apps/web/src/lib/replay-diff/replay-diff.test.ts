/**
 * Tests for replay diff engine.
 * Per-type test battery + depth-cap behavior + precheck logic + perf.
 */

import { 
    diffLedgerSnapshots, 
    checkComparability, 
    filterOperations, 
    summarizeOperations,
    createMockSnapshot,
    MAX_DIFF_DEPTH,
} from './index';

import { LedgerStateChange } from '../../app/types';

describe('checkComparability', () => {
    it('returns compatible for matching contract and schema', () => {
        const left = createMockSnapshot('run-1');
        const right = createMockSnapshot('run-2');
        const result = checkComparability(left, right);
        expect(result.compatible).toBe(true);
    });

    it('rejects different contract IDs', () => {
        const left = createMockSnapshot('run-1', 'contract-A');
        const right = createMockSnapshot('run-2', 'contract-B');
        const result = checkComparability(left, right);
        expect(result.compatible).toBe(false);
        expect(result.reason).toContain('Contract ID mismatch');
    });

    it('rejects different schema hashes', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash-A');
        const right = createMockSnapshot('run-2', 'contract-1', 'hash-B');
        const result = checkComparability(left, right);
        expect(result.compatible).toBe(false);
        expect(result.reason).toContain('Schema hash mismatch');
    });
});

describe('diffLedgerSnapshots - comparability', () => {
    it('returns incompatible result for mismatched contracts', () => {
        const left = createMockSnapshot('run-1', 'contract-A');
        const right = createMockSnapshot('run-2', 'contract-B');
        const result = diffLedgerSnapshots(left, right);
        
        expect(result.comparability.compatible).toBe(false);
        expect(result.operations).toHaveLength(0);
        expect(result.metadata.leftContractId).toBe('contract-A');
        expect(result.metadata.rightContractId).toBe('contract-B');
    });

    it('includes diff time in metadata', () => {
        const left = createMockSnapshot('run-1');
        const right = createMockSnapshot('run-2');
        const result = diffLedgerSnapshots(left, right);
        expect(result.metadata.diffTimeMs).toBeGreaterThanOrEqual(0);
    });
});

describe('diffLedgerSnapshots - operation types', () => {
    it('detects added entries', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', { ledgerState: [] });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'new-key',
                entryType: 'ContractData',
                changeType: 'created',
                after: JSON.stringify({ value: 'new' }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        const added = result.operations.filter(op => op.type === 'added');
        expect(added.length).toBe(1);
        expect(added[0].type).toBe('added');
    });

    it('detects removed entries', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'old-key',
                entryType: 'ContractData',
                changeType: 'deleted',
                before: JSON.stringify({ value: 'old' }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', { ledgerState: [] });

        const result = diffLedgerSnapshots(left, right);
        const removed = result.operations.filter(op => op.type === 'removed');
        expect(removed.length).toBe(1);
        expect(removed[0].type).toBe('removed');
    });

    it('detects changed entries', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'shared-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ balance: 1000 }),
                after: JSON.stringify({ balance: 1100 }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'shared-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ balance: 1000 }),
                after: JSON.stringify({ balance: 1200 }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        const changed = result.operations.filter(op => op.type === 'changed');
        expect(changed.length).toBe(1);
        expect(changed[0].type).toBe('changed');
        expect(changed[0].fieldDiffs).toBeDefined();
        expect(changed[0].fieldDiffs!.length).toBeGreaterThan(0);
    });

    it('detects unchanged entries', () => {
        const ledgerState: LedgerStateChange[] = [{
            id: 'shared-key',
            entryType: 'ContractData',
            changeType: 'updated',
            before: JSON.stringify({ balance: 1000 }),
            after: JSON.stringify({ balance: 1000 }),
        }];

        const left = createMockSnapshot('run-1', 'contract-1', 'hash', { ledgerState });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', { ledgerState });

        const result = diffLedgerSnapshots(left, right);
        const unchanged = result.operations.filter(op => op.type === 'unchanged');
        expect(unchanged.length).toBe(1);
    });

    it('handles nested object changes with depth limit', () => {
        const nestedBefore = {
            vault: {
                positions: {
                    pos1: { shares: 100, locked: true },
                    nested: { deep: { value: 1 } },
                },
            },
        };
        const nestedAfter = {
            vault: {
                positions: {
                    pos1: { shares: 200, locked: true },
                    nested: { deep: { value: 2 } },
                },
            },
        };

        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'nested-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify(nestedBefore),
                after: JSON.stringify(nestedAfter),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'nested-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify(nestedBefore),
                after: JSON.stringify({
                    vault: {
                        positions: {
                            pos1: { shares: 300, locked: true },
                            nested: { deep: { value: 3 } },
                        },
                    },
                }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        const changed = result.operations.filter(op => op.type === 'changed');
        expect(changed.length).toBe(1);
        
        // Should have field diffs for nested changes
        const op = changed[0];
        expect(op.fieldDiffs).toBeDefined();
    });

    it('handles raw bytes (non-JSON) payloads', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'bytes-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: 'AAAAAA==',
                after: 'AAAAAQ==',
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'bytes-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: 'AAAAAA==',
                after: 'AAAAAg==',
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        expect(result.operations.length).toBeGreaterThanOrEqual(1);
    });

    it('handles missing before/after values', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'created-key',
                entryType: 'ContractData',
                changeType: 'created',
                after: JSON.stringify({ value: 'new' }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'deleted-key',
                entryType: 'ContractData',
                changeType: 'deleted',
                before: JSON.stringify({ value: 'old' }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        expect(result.operations.some(op => op.type === 'added')).toBe(true);
        expect(result.operations.some(op => op.type === 'removed')).toBe(true);
    });
});

describe('filterOperations', () => {
    const mockOps = [
        { type: 'added' as const, key: '1' },
        { type: 'removed' as const, key: '2' },
        { type: 'changed' as const, key: '3' },
        { type: 'unchanged' as const, key: '4' },
    ] as any;

    it('returns all for "all" filter', () => {
        expect(filterOperations(mockOps, 'all')).toHaveLength(4);
    });

    it('filters by type', () => {
        expect(filterOperations(mockOps, 'added')).toHaveLength(1);
        expect(filterOperations(mockOps, 'removed')).toHaveLength(1);
        expect(filterOperations(mockOps, 'changed')).toHaveLength(1);
        expect(filterOperations(mockOps, 'unchanged')).toHaveLength(1);
    });
});

describe('summarizeOperations', () => {
    const mockOps = [
        { type: 'added' },
        { type: 'added' },
        { type: 'removed' },
        { type: 'changed' },
        { type: 'unchanged' },
        { type: 'unchanged' },
        { type: 'unchanged' },
    ] as any;

    it('counts by type', () => {
        const summary = summarizeOperations(mockOps);
        expect(summary.total).toBe(7);
        expect(summary.added).toBe(2);
        expect(summary.removed).toBe(1);
        expect(summary.changed).toBe(1);
        expect(summary.unchanged).toBe(3);
    });
});

describe('depth limiting', () => {
    it('respects MAX_DIFF_DEPTH', () => {
        // Create deeply nested object
        let deepObj: any = { value: 1 };
        for (let i = 0; i < MAX_DIFF_DEPTH + 5; i++) {
            deepObj = { nested: deepObj };
        }

        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'deep-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify(deepObj),
                after: JSON.stringify({ ...deepObj, value: 2 }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'deep-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify(deepObj),
                after: JSON.stringify({ nested: { ...deepObj.nested, value: 3 } }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        // Should complete without stack overflow
        expect(result).toBeDefined();
    });
});

describe('performance', () => {
    it('diffs 10k entries under 150ms', () => {
        const ledgerState = Array.from({ length: 10000 }, (_, i) => ({
            id: `key-${i}`,
            entryType: 'ContractData',
            changeType: i % 3 === 0 ? 'created' : i % 3 === 1 ? 'updated' : 'deleted',
            before: i % 3 !== 0 ? JSON.stringify({ value: i }) : undefined,
            after: i % 3 !== 2 ? JSON.stringify({ value: i + 1 }) : undefined,
        }));

        const left = createMockSnapshot('run-1', 'contract-1', 'hash', { ledgerState });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: ledgerState.map((e, i) => ({ ...e, id: `key-${i}-right` })),
        });

        const start = performance.now();
        const result = diffLedgerSnapshots(left, right);
        const elapsed = performance.now() - start;

        console.log(`Diffed 10k entries in ${elapsed.toFixed(2)}ms`);
        expect(elapsed).toBeLessThan(150);
        expect(result.operations.length).toBeGreaterThan(0);
    });
});

describe('edge cases', () => {
    it('handles empty snapshots', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', { ledgerState: [] });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', { ledgerState: [] });
        const result = diffLedgerSnapshots(left, right);
        expect(result.operations).toHaveLength(0);
        expect(result.summary.total).toBe(0);
    });

    it('handles large numeric values', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'big-num',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ balance: '9007199254740991' }), // MAX_SAFE_INTEGER
                after: JSON.stringify({ balance: '9007199254740992' }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'big-num',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ balance: '9007199254740991' }),
                after: JSON.stringify({ balance: '9007199254740993' }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        expect(result.operations.length).toBeGreaterThanOrEqual(1);
    });

    it('handles arrays in ledger values', () => {
        const left = createMockSnapshot('run-1', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'array-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ tags: ['a', 'b'] }),
                after: JSON.stringify({ tags: ['a', 'b', 'c'] }),
            }],
        });
        const right = createMockSnapshot('run-2', 'contract-1', 'hash', {
            ledgerState: [{
                id: 'array-key',
                entryType: 'ContractData',
                changeType: 'updated',
                before: JSON.stringify({ tags: ['a', 'b'] }),
                after: JSON.stringify({ tags: ['a', 'b', 'c', 'd'] }),
            }],
        });

        const result = diffLedgerSnapshots(left, right);
        expect(result.operations.length).toBeGreaterThanOrEqual(1);
    });
});