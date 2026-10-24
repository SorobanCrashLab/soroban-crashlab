import { describe, expect, it } from 'vitest';
import {
  comparisonHref,
  decodeComparisonSearch,
  encodeComparisonSearch,
  matchesComparisonFilter,
} from './url-state';

describe('comparison url state', () => {
  describe('decodeComparisonSearch', () => {
    it('decodes a valid pair with filters', () => {
      const result = decodeComparisonSearch({
        base: 'run-1',
        candidate: 'run-2',
        failureClass: 'auth',
        contract: 'token',
      });

      expect(result).toEqual({
        ok: true,
        state: { base: 'run-1', candidate: 'run-2', failureClass: 'auth', contract: 'token' },
      });
    });

    it('accepts the legacy `class` alias for the failure-class filter', () => {
      const result = decodeComparisonSearch({ base: 'a', candidate: 'b', class: 'budget' });
      expect(result.ok && result.state.failureClass).toBe('budget');
    });

    it('reports a missing baseline', () => {
      expect(decodeComparisonSearch({ candidate: 'b' })).toMatchObject({
        ok: false,
        reason: 'missing-base',
      });
    });

    it('reports a missing candidate', () => {
      expect(decodeComparisonSearch({ base: 'a' })).toMatchObject({
        ok: false,
        reason: 'missing-candidate',
      });
    });

    it('refuses to compare a run with itself', () => {
      expect(decodeComparisonSearch({ base: 'same', candidate: 'same' })).toMatchObject({
        ok: false,
        reason: 'same-run',
      });
    });

    it('rejects ids that are not slugs', () => {
      expect(decodeComparisonSearch({ base: '../../etc/passwd', candidate: 'b' })).toMatchObject({
        ok: false,
        reason: 'invalid-id',
      });
      expect(decodeComparisonSearch({ base: 'a', candidate: 'b c' })).toMatchObject({
        ok: false,
        reason: 'invalid-id',
      });
      expect(decodeComparisonSearch({ base: 'x'.repeat(129), candidate: 'b' })).toMatchObject({
        ok: false,
        reason: 'invalid-id',
      });
    });

    it('trims whitespace around ids', () => {
      const result = decodeComparisonSearch({ base: '  run-1 ', candidate: ' run-2  ' });
      expect(result.ok && result.state).toEqual({ base: 'run-1', candidate: 'run-2' });
    });

    it('takes the first value when a query key repeats', () => {
      const result = decodeComparisonSearch({ base: ['run-1', 'run-9'], candidate: 'run-2' });
      expect(result.ok && result.state.base).toBe('run-1');
    });

    it('drops an empty filter rather than honouring it as a filter', () => {
      const result = decodeComparisonSearch({ base: 'a', candidate: 'b', failureClass: '   ' });
      expect(result.ok && result.state.failureClass).toBeUndefined();
    });
  });

  describe('encodeComparisonSearch', () => {
    it('round-trips through decode', () => {
      const state = { base: 'run-1', candidate: 'run-2', failureClass: 'auth', contract: 'token' };
      const decoded = decodeComparisonSearch(
        Object.fromEntries(new URLSearchParams(encodeComparisonSearch(state))),
      );
      expect(decoded).toEqual({ ok: true, state });
    });

    it('omits empty filters', () => {
      const encoded = encodeComparisonSearch({ base: 'a', candidate: 'b', failureClass: '' });
      expect(encoded).toBe('base=a&candidate=b');
    });

    it('builds a shareable href', () => {
      expect(comparisonHref({ base: 'run-1', candidate: 'run-2' })).toBe(
        '/compare?base=run-1&candidate=run-2',
      );
    });
  });

  describe('matchesComparisonFilter', () => {
    it('matches everything when no filter is set', () => {
      expect(matchesComparisonFilter({ failureClass: 'auth' }, {})).toBe(true);
    });

    it('requires an exact failure class', () => {
      expect(matchesComparisonFilter({ failureClass: 'auth' }, { failureClass: 'auth' })).toBe(true);
      expect(matchesComparisonFilter({ failureClass: 'auth' }, { failureClass: 'budget' })).toBe(false);
      expect(matchesComparisonFilter({}, { failureClass: 'auth' })).toBe(false);
    });

    it('matches contract filters against contract or signature, case-insensitively', () => {
      expect(matchesComparisonFilter({ contract: 'TokenContract' }, { contract: 'tokencontract' })).toBe(
        true,
      );
      expect(matchesComparisonFilter({ signature: 'auth-token-expired' }, { contract: 'token' })).toBe(
        true,
      );
      expect(matchesComparisonFilter({ signature: 'budget-overflow' }, { contract: 'token' })).toBe(
        false,
      );
    });
  });
});
