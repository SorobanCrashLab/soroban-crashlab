import { describe, expect, it } from 'vitest';
import {
  compareReplayEnvironments,
  mayRunReplay,
  parseReplayEnvironment,
} from './environment';

describe('replay environment fingerprint', () => {
  const recorded = {
    engineVersion: 'crashlab 0.9.1',
    contractWasmHash: 'abc123',
    networkConfigHash: 'testnet-2026-01',
    seedSet: 'seeds-a',
  };

  it('reports a match when every shared field agrees', () => {
    const check = compareReplayEnvironments(recorded, { ...recorded });
    expect(check.status).toBe('match');
    expect(check.mismatches).toEqual([]);
    expect(check.requiresAcknowledgement).toBe(false);
    expect(mayRunReplay(check)).toBe(true);
  });

  it('lists every field that differs', () => {
    const check = compareReplayEnvironments(recorded, {
      ...recorded,
      engineVersion: 'crashlab 0.9.2',
      networkConfigHash: 'mainnet',
    });

    expect(check.status).toBe('mismatch');
    expect(check.mismatches).toEqual([
      { field: 'engineVersion', expected: 'crashlab 0.9.1', actual: 'crashlab 0.9.2' },
      { field: 'networkConfigHash', expected: 'testnet-2026-01', actual: 'mainnet' },
    ]);
    expect(check.summary).toMatch(/engine version/i);
    expect(check.summary).toMatch(/network config/i);
    expect(check.requiresAcknowledgement).toBe(true);
    expect(mayRunReplay(check)).toBe(false);
  });

  it('allows the run once the mismatch is acknowledged', () => {
    const check = compareReplayEnvironments(recorded, { ...recorded, engineVersion: '9.9.9' }, true);
    expect(check.status).toBe('mismatch');
    expect(check.acknowledged).toBe(true);
    expect(check.requiresAcknowledgement).toBe(false);
    expect(mayRunReplay(check)).toBe(true);
  });

  it('is unknown when neither side has a fingerprint', () => {
    const check = compareReplayEnvironments(undefined, undefined);
    expect(check.status).toBe('unknown');
    expect(check.requiresAcknowledgement).toBe(false);
    expect(mayRunReplay(check)).toBe(true);
  });

  it('is unknown when only one side has a fingerprint', () => {
    expect(compareReplayEnvironments(recorded, undefined).status).toBe('unknown');
    expect(compareReplayEnvironments(undefined, recorded).status).toBe('unknown');
    expect(compareReplayEnvironments({}, recorded).status).toBe('unknown');
  });

  it('ignores fields present on only one side', () => {
    const check = compareReplayEnvironments(
      { engineVersion: '1.0.0' },
      { engineVersion: '1.0.0', seedSet: 'seeds-b' },
    );
    expect(check.status).toBe('match');
  });

  it('treats blank strings as absent', () => {
    const check = compareReplayEnvironments(
      { engineVersion: '  ' },
      { engineVersion: '1.0.0' },
    );
    expect(check.status).toBe('unknown');
  });

  it('parses a client-supplied environment without trusting shape', () => {
    expect(parseReplayEnvironment(null)).toBeUndefined();
    expect(parseReplayEnvironment([])).toBeUndefined();
    expect(parseReplayEnvironment({ engineVersion: 5 })).toBeUndefined();
    expect(parseReplayEnvironment({ engineVersion: '   ' })).toBeUndefined();

    expect(
      parseReplayEnvironment({
        engineVersion: ' 1.0.0 ',
        contractWasmHash: 'abc',
        ignored: 'dropped',
      }),
    ).toEqual({ engineVersion: '1.0.0', contractWasmHash: 'abc' });
  });

  it('bounds a hostile long value', () => {
    const parsed = parseReplayEnvironment({ engineVersion: 'x'.repeat(1_000) });
    expect(parsed?.engineVersion).toHaveLength(256);
  });
});
