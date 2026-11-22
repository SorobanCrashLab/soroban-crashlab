import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  computeFingerprint,
  verifyFingerprint,
  FINGERPRINT_PARTICIPANTS,
  type ReplayFingerprintComponents,
} from './fingerprint';

describe('Canonical serialization', () => {
  it('field-order independence', () => {
    const a = canonicalize({ b: 2, a: 1 });
    const b = canonicalize({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('whitespace immunity in string values', () => {
    const a = canonicalize({ seed: 'hello world' });
    const b = canonicalize({ seed: 'hello  world' });
    expect(a).not.toBe(b);
  });

  it('handles nested objects', () => {
    const result = canonicalize({ outer: { inner: 'value' } });
    expect(result).toContain('"outer"');
    expect(result).toContain('"inner"');
  });

  it('handles arrays', () => {
    const result = canonicalize([3, 1, 2]);
    expect(result).toBe('[3,1,2]');
  });

  it('handles null', () => {
    expect(canonicalize(null)).toBe('null');
  });

  it('handles primitives', () => {
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize('test')).toBe('"test"');
  });

  it('shuffled serializations produce same canonical form', () => {
    const values = [
      { z: 'last', a: 'first', m: 'middle' },
      { a: 'first', m: 'middle', z: 'last' },
      { m: 'middle', z: 'last', a: 'first' },
    ];
    const canonical = values.map(canonicalize);
    expect(new Set(canonical).size).toBe(1);
  });
});

describe('Fingerprint computation', () => {
  const components: ReplayFingerprintComponents = {
    seedSet: 'seed-abc-123',
    contractWasmHash: 'wasm-hash-def',
    engineVersion: 'v2.1.0',
    networkConfigHash: 'net-cfg-456',
  };

  it('produces deterministic hash', async () => {
    const a = await computeFingerprint(components);
    const b = await computeFingerprint(components);
    expect(a.composite).toBe(b.composite);
  });

  it('different inputs produce different composites', async () => {
    const a = await computeFingerprint(components);
    const b = await computeFingerprint({ ...components, engineVersion: 'v2.2.0' });
    expect(a.composite).not.toBe(b.composite);
  });

  it('component hashes are sha256 hex strings', async () => {
    const fp = await computeFingerprint(components);
    expect(fp.components.seedSet).toMatch(/^[a-f0-9]{64}$/);
    expect(fp.components.contractWasmHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fp.components.engineVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(fp.components.networkConfigHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('one-flag change flips composite only', async () => {
    const original = await computeFingerprint(components);
    const modified = await computeFingerprint({ ...components, engineVersion: 'v3.0.0' });
    expect(original.composite).not.toBe(modified.composite);
    expect(original.components.seedSet).toBe(modified.components.seedSet);
    expect(original.components.contractWasmHash).toBe(modified.components.contractWasmHash);
  });

  it('stampedAt is a valid ISO string', async () => {
    const fp = await computeFingerprint(components);
    expect(new Date(fp.stampedAt).toISOString()).toBe(fp.stampedAt);
  });
});

describe('Fingerprint verification', () => {
  const components: ReplayFingerprintComponents = {
    seedSet: 'seed-abc-123',
    contractWasmHash: 'wasm-hash-def',
    engineVersion: 'v2.1.0',
    networkConfigHash: 'net-cfg-456',
  };

  it('returns match for identical components', async () => {
    const fp = await computeFingerprint(components);
    const result = await verifyFingerprint(fp, components);
    expect(result).toBe('match');
  });

  it('returns mismatch for different components', async () => {
    const fp = await computeFingerprint(components);
    const result = await verifyFingerprint(fp, { ...components, engineVersion: 'v3.0.0' });
    expect(result).toBe('mismatch');
  });

  it('returns unknown for undefined fingerprint', async () => {
    const result = await verifyFingerprint(undefined as never, components);
    expect(result).toBe('unknown');
  });
});

describe('Fingerprint participants', () => {
  it('includes all required participants', () => {
    expect(FINGERPRINT_PARTICIPANTS).toHaveLength(4);
    const keys = FINGERPRINT_PARTICIPANTS.map((p) => p.key);
    expect(keys).toContain('seedSet');
    expect(keys).toContain('contractWasmHash');
    expect(keys).toContain('engineVersion');
    expect(keys).toContain('networkConfigHash');
  });

  it('each participant has a label', () => {
    FINGERPRINT_PARTICIPANTS.forEach((p) => {
      expect(p.label).toBeTruthy();
    });
  });
});
