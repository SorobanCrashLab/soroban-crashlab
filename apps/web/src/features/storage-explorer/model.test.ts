import { describe, expect, it } from 'vitest';
import {
  analyzeAccessPatterns,
  buildHeatmap,
  buildKeyspaceTree,
  decodeValue,
  diffSnapshots,
  redactEntry,
  summarizeKeyspace,
  type AccessEvent,
  type StorageEntry,
  type StorageSnapshot,
} from './model';

function entry(overrides: Partial<StorageEntry> = {}): StorageEntry {
  return {
    key: 'balances:alice',
    storageClass: 'persistent',
    namespace: 'token',
    owner: 'CABC123',
    raw: '42',
    decodedType: 'u64',
    decodedValue: '42',
    valueBytes: 64,
    reads: 10,
    writes: 2,
    lastAccessLedger: 100,
    ttlLedger: null,
    sensitive: false,
    confidence: 0.9,
    ...overrides,
  };
}

function snapshot(id: string, entries: StorageEntry[]): StorageSnapshot {
  return { id, contractId: 'CCONTRACT', campaignId: null, ledger: 100, capturedAt: '2026-01-01T00:00:00Z', entries };
}

describe('decodeValue', () => {
  it('decodes booleans, integers, hex, addresses and structured values', () => {
    expect(decodeValue('true')).toMatchObject({ type: 'bool', confidence: 1 });
    expect(decodeValue('42').type).toBe('u64');
    expect(decodeValue('0xdeadbeef').type).toBe('bytes');
    expect(decodeValue('C' + 'A'.repeat(55)).type).toBe('address');
    expect(decodeValue('{"a":1}')).toMatchObject({ type: 'map', confidence: 0.6 });
  });

  it('returns an explicit low-confidence unknown for unrecognised values', () => {
    expect(decodeValue('not-decodable')).toMatchObject({ type: 'unknown', confidence: 0.2 });
  });

  it('honours a schema hint', () => {
    expect(decodeValue('anything', 'i128')).toMatchObject({ type: 'i128', confidence: 0.95 });
  });
});

describe('buildKeyspaceTree', () => {
  it('groups entries by namespace and key segments with aggregated counts', () => {
    const tree = buildKeyspaceTree([
      entry({ key: 'balances:alice', reads: 4, writes: 1 }),
      entry({ key: 'balances:bob', reads: 6, writes: 2 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('token');
    const balances = tree[0].children.find((node) => node.label === 'balances');
    expect(balances?.entryCount).toBe(2);
    expect(balances?.reads).toBe(10);
    expect(balances?.writes).toBe(3);
  });

  it('is deterministic regardless of input order', () => {
    const a = [entry({ key: 'a:x' }), entry({ key: 'b:y' })];
    const b = [a[1], a[0]];
    expect(buildKeyspaceTree(b)).toEqual(buildKeyspaceTree(a));
  });
});

describe('buildHeatmap', () => {
  it('ranks keys by the requested metric and assigns levels', () => {
    const cells = buildHeatmap([
      entry({ key: 'cold', reads: 1 }),
      entry({ key: 'hot', reads: 100 }),
    ], 'reads');
    expect(cells[0].key).toBe('hot');
    expect(cells[0].level).toBe('critical');
    expect(cells[1].level).toBe('cold');
  });

  it('breaks ties by key for deterministic output', () => {
    const cells = buildHeatmap([entry({ key: 'z' }), entry({ key: 'a' })], 'writes');
    expect(cells.map((cell) => cell.key)).toEqual(['a', 'z']);
  });
});

describe('analyzeAccessPatterns', () => {
  it('flags hot keys and expired TTLs', () => {
    const anomalies = analyzeAccessPatterns([
      entry({ key: 'hot', reads: 120, writes: 30 }),
      entry({ key: 'expired', ttlLedger: 50 }),
    ], [], 100);
    expect(anomalies.map((a) => a.kind)).toContain('hot-key');
    expect(anomalies.map((a) => a.kind)).toContain('ttl-expiry');
  });

  it('flags writes to unknown keys', () => {
    const event: AccessEvent = {
      contractId: 'CCONTRACT', key: 'ghost', operation: 'write', ledger: 1, spanId: null, callSite: 'mint()',
    };
    const anomalies = analyzeAccessPatterns([entry()], [event], 100);
    expect(anomalies[0]).toMatchObject({ kind: 'unexpected-write', severity: 'critical' });
  });
});

describe('diffSnapshots', () => {
  it('reports added, removed, modified and unchanged keys deterministically', () => {
    const before = snapshot('a', [
      entry({ key: 'keep' }),
      entry({ key: 'change', decodedValue: '1' }),
      entry({ key: 'drop' }),
    ]);
    const after = snapshot('b', [
      entry({ key: 'keep' }),
      entry({ key: 'change', decodedValue: '2' }),
      entry({ key: 'add' }),
    ]);
    const rows = diffSnapshots(before, after);
    expect(rows.map((row) => [row.key, row.kind])).toEqual([
      ['add', 'added'],
      ['change', 'modified'],
      ['drop', 'removed'],
      ['keep', 'unchanged'],
    ]);
  });
});

describe('redactEntry', () => {
  it('masks sensitive values and supports authorized reveal', () => {
    const secret = entry({ key: 'secret', sensitive: true, decodedValue: 'sk_live_123' });
    expect(redactEntry(secret).decodedValue).toBe('***');
    expect(redactEntry(secret, true)).toBe(secret);
  });
});

describe('summarizeKeyspace', () => {
  it('produces a non-visual summary', () => {
    expect(summarizeKeyspace([])).toContain('No storage entries');
    expect(summarizeKeyspace([entry()])).toContain('1 persistent');
  });
});
