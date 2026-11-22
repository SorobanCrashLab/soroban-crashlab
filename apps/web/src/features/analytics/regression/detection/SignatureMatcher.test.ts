/** Signature matching and run comparison tests (#2207). */
import { describe, expect, it } from 'vitest';
import { normalizeSignature, signaturesMatch, similarity } from './SignatureMatcher';
import { compareRuns } from './ComparisonEngine';

describe('signature matching', () => {
  it('normalizes volatile ids', () => {
    expect(normalizeSignature('  Reentrancy 0xabc123  ')).toBe('reentrancy 0x');
  });

  it('matches identical and near-identical signatures', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(signaturesMatch('Reentrancy at withdraw', 'reentrancy at withdraw')).toBe(true);
    expect(signaturesMatch('Reentrancy at withdraw', 'Out of gas')).toBe(false);
  });
});

describe('run comparison', () => {
  const baseline = [
    { signature: 'SIG-OVERFLOW-042', count: 3 },
    { signature: 'SIG-ACCESS-007', count: 1 },
  ];

  it('detects new and fixed signatures', () => {
    const result = compareRuns(baseline, [
      { signature: 'SIG-OVERFLOW-042', count: 4 },
      { signature: 'SIG-REENTRANCY-001', count: 2 },
    ]);
    expect(result.persistentSignatures).toHaveLength(1);
    expect(result.newSignatures.map((s) => s.signature)).toEqual(['SIG-REENTRANCY-001']);
    expect(result.fixedSignatures.map((s) => s.signature)).toEqual(['SIG-ACCESS-007']);
  });

  it('handles empty runs', () => {
    const result = compareRuns([], []);
    expect(result).toEqual({ newSignatures: [], fixedSignatures: [], persistentSignatures: [] });
  });
});
