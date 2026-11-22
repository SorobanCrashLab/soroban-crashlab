import { describe, expect, it } from 'vitest';
import { normalizeSnapshots } from './normalizeSnapshots';
import { diffStateSnapshots } from './diffEngine';
import { buildStateKeyIndex, searchStateKeyIndex } from './keyIndex';

describe('state timeline normalization', () => {
  it('normalizes snapshots and redacts sensitive fields', () => {
    const result = normalizeSnapshots({ runId: 'run-1', artifacts: [{
      snapshots: [{ id: 's1', ledger: 10, entries: { 'contract:balance': { amount: 3, secret: 'do-not-show' } } }],
      mutations: [{ id: 'm1', key: 'contract:balance', contract: 'contract', before: { amount: 2 }, after: { amount: 3 }, ledger: 10 }],
    }] });
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].entries['contract:balance']).toEqual({ amount: 3, secret: '[REDACTED]' });
    expect(result.mutations[0].changeType).toBe('modified');
    expect(result.quality.status).toBe('complete');
  });

  it('marks derived ledger-only history as partial', () => {
    const result = normalizeSnapshots({ runId: 'run-2', ledgerChanges: [{ id: 'contract:key', entryType: 'ContractData', changeType: 'created', after: '{"value":1}' }] });
    expect(result.quality.status).toBe('partial');
    expect(result.snapshots.length).toBe(2);
  });
});

describe('state diff engine', () => {
  it('classifies deterministic nested changes in canonical order', () => {
    const data = normalizeSnapshots({ runId: 'run-1', artifacts: [{ snapshots: [
      { id: 'a', entries: { z: 1, a: { old: true, same: 1 } } },
      { id: 'b', entries: { z: 1, a: { next: true, same: 1 } } },
    ] }] });
    const diff = diffStateSnapshots(data.snapshots[0], data.snapshots[1]);
    expect(diff.map((entry) => [entry.path, entry.changeType])).toEqual([['a.next', 'added'], ['a.old', 'removed']]);
  });

  it('caps output for large diffs', () => {
    const before = { id: 'a', label: 'a', entries: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i), i])), complete: true, source: 'test' };
    const after = { ...before, id: 'b', entries: {} };
    expect(diffStateSnapshots(before, after, 10)).toHaveLength(10);
  });
});

describe('state key index', () => {
  it('groups mutations and searches by contract or namespace', () => {
    const data = normalizeSnapshots({ runId: 'run-1', ledgerChanges: [
      { id: 'vault:balance', entryType: 'ContractData', changeType: 'created', after: '{"amount":1}' },
      { id: 'vault:balance', entryType: 'ContractData', changeType: 'updated', before: '{"amount":1}', after: '{"amount":2}' },
    ] });
    const index = buildStateKeyIndex(data.mutations);
    expect(index).toHaveLength(1);
    expect(index[0].mutations).toHaveLength(2);
    expect(searchStateKeyIndex(index, 'contractdata')).toHaveLength(1);
  });
});
