import { describe, expect, it } from 'vitest';
import {
  ComparisonTooLargeError,
  MAX_COMPARISON_SIGNATURES,
  buildComparisonDelta,
  buildRunMetricDeltas,
  compareSides,
  hasNoChanges,
  normaliseSignatures,
  type ComparisonSide,
  type SignatureSample,
} from './delta';

function samples(...entries: Array<[string, number]>): SignatureSample[] {
  return entries.map(([signature, count]) => ({ signature, count }));
}

describe('comparison delta model', () => {
  describe('normaliseSignatures', () => {
    it('deduplicates by signature and sums counts', () => {
      const normalised = normaliseSignatures([
        { signature: 'sig-a', count: 2, failureClass: 'auth' },
        { signature: 'sig-a', count: 3 },
        { signature: 'sig-b', count: 1, contract: 'token' },
      ]);

      expect(normalised).toHaveLength(2);
      expect(normalised.find((sample) => sample.signature === 'sig-a')?.count).toBe(5);
      expect(normalised.find((sample) => sample.signature === 'sig-a')?.failureClass).toBe('auth');
      expect(normalised.find((sample) => sample.signature === 'sig-b')?.contract).toBe('token');
    });

    it('trims signatures and drops blank or non-positive rows', () => {
      const normalised = normaliseSignatures([
        { signature: '  sig-a  ', count: 1 },
        { signature: '   ', count: 4 },
        { signature: 'sig-b', count: 0 },
        { signature: 'sig-c', count: -3 },
        { signature: 'sig-d', count: Number.NaN },
      ]);

      expect(normalised.map((sample) => sample.signature)).toEqual(['sig-a']);
    });

    it('is deterministic for the same input', () => {
      const input = samples(['b', 2], ['a', 1], ['b', 1]);
      expect(normaliseSignatures(input)).toEqual(normaliseSignatures(input));
    });
  });

  describe('buildComparisonDelta', () => {
    it('classifies added, removed, changed and unchanged signatures', () => {
      const delta = buildComparisonDelta(
        samples(['shared', 10], ['gone', 4], ['moved', 2], ['same', 7]),
        samples(['shared', 12], ['new', 5], ['moved', 1], ['same', 7]),
      );

      expect(delta.added.map((row) => row.signature)).toEqual(['new']);
      expect(delta.removed.map((row) => row.signature)).toEqual(['gone']);
      expect(delta.changed.map((row) => row.signature)).toEqual(['shared', 'moved']);
      expect(delta.unchanged.map((row) => row.signature)).toEqual(['same']);

      expect(delta.totals).toEqual({
        baseSignatures: 4,
        candidateSignatures: 4,
        added: 1,
        removed: 1,
        changed: 2,
        unchanged: 1,
      });
    });

    it('orders changed rows by absolute volume, then signature', () => {
      const delta = buildComparisonDelta(
        samples(['small', 2], ['big', 10], ['middle', 5], ['alpha', 1], ['beta', 1]),
        samples(['small', 1], ['big', 20], ['middle', 0], ['alpha', 2], ['beta', 2]),
      );

      // middle is removed (goes to its own bucket); remaining changed rows are
      // ordered by |delta|: big (+10), small (−1), alpha (+1), beta (+1).
      expect(delta.removed.map((row) => row.signature)).toEqual(['middle']);
      expect(delta.changed.map((row) => row.signature)).toEqual(['big', 'alpha', 'beta', 'small']);
    });

    it('reports a run compared with itself as no changes', () => {
      const side = samples(['sig-a', 3], ['sig-b', 1]);
      const delta = buildComparisonDelta(side, side);

      expect(delta.added).toEqual([]);
      expect(delta.removed).toEqual([]);
      expect(delta.changed).toEqual([]);
      expect(delta.unchanged).toHaveLength(2);
      expect(hasNoChanges(delta)).toBe(true);
    });

    it('is not "no changes" when a signature frequency moved', () => {
      const delta = buildComparisonDelta(samples(['sig-a', 3]), samples(['sig-a', 4]));
      expect(delta.changed).toHaveLength(1);
      expect(hasNoChanges(delta)).toBe(false);
    });

    it('carries metadata from whichever side still has the signature', () => {
      const delta = buildComparisonDelta(
        [{ signature: 'sig-a', count: 1, failureClass: 'auth', contract: 'token', severity: 'high' }],
        [{ signature: 'sig-a', count: 2 }],
      );
      const row = delta.changed[0];

      expect(row?.failureClass).toBe('auth');
      expect(row?.contract).toBe('token');
      expect(row?.severity).toBe('high');
      expect(row?.delta).toBe(1);
    });

    it('handles one empty side', () => {
      const onlyCandidate = buildComparisonDelta([], samples(['sig-a', 2]));
      expect(onlyCandidate.added).toHaveLength(1);
      expect(onlyCandidate.totals.baseSignatures).toBe(0);

      const onlyBase = buildComparisonDelta(samples(['sig-a', 2]), []);
      expect(onlyBase.removed).toHaveLength(1);
      expect(onlyBase.totals.candidateSignatures).toBe(0);
    });

    it('enforces the signature bound with actionable guidance', () => {
      const oversized = Array.from({ length: MAX_COMPARISON_SIGNATURES + 1 }, (_, index) => ({
        signature: `sig-${index}`,
        count: 1,
      }));

      expect(() => buildComparisonDelta(oversized, [])).toThrow(ComparisonTooLargeError);
      try {
        buildComparisonDelta(oversized, []);
      } catch (error) {
        const tooLarge = error as ComparisonTooLargeError;
        expect(tooLarge.signatureCount).toBe(MAX_COMPARISON_SIGNATURES + 1);
        expect(tooLarge.limit).toBe(MAX_COMPARISON_SIGNATURES);
        expect(tooLarge.message).toMatch(/narrow/i);
        expect(tooLarge.guidance).toMatch(/failure-class/i);
      }
    });

    it('accepts exactly the limit and honours a custom bound', () => {
      const atLimit = samples(['a', 1], ['b', 1], ['c', 1]);
      expect(() => buildComparisonDelta(atLimit, [], { limit: 3 })).not.toThrow();
      expect(() => buildComparisonDelta(atLimit, [], { limit: 2 })).toThrow(ComparisonTooLargeError);
    });

    it('produces identical output for identical input', () => {
      const base = samples(['a', 2], ['b', 5], ['c', 1]);
      const candidate = samples(['a', 3], ['b', 4], ['d', 9]);
      expect(buildComparisonDelta(base, candidate)).toEqual(buildComparisonDelta(base, candidate));
    });
  });

  describe('metric deltas', () => {
    it('marks direction and whether the direction is good', () => {
      const metrics = buildRunMetricDeltas(
        { seeds: 100, failures: 5, durationMs: 2000, coveragePercent: 80 },
        { seeds: 120, failures: 2, durationMs: 1500, coveragePercent: 85 },
      );

      const seeds = metrics.find((metric) => metric.key === 'seeds');
      expect(seeds).toMatchObject({ base: 100, candidate: 120, delta: 20, direction: 'up', higherIsBetter: true });

      const failures = metrics.find((metric) => metric.key === 'failures');
      expect(failures).toMatchObject({ delta: -3, direction: 'down', higherIsBetter: false });

      const duration = metrics.find((metric) => metric.key === 'durationMs');
      expect(duration).toMatchObject({ delta: -500, direction: 'down', higherIsBetter: false, unit: 'ms' });

      const coverage = metrics.find((metric) => metric.key === 'coveragePercent');
      expect(coverage).toMatchObject({ delta: 5, direction: 'up', higherIsBetter: true, unit: '%' });
    });

    it('omits coverage when neither side reports it', () => {
      const metrics = buildRunMetricDeltas(
        { seeds: 1, failures: 0, durationMs: 1 },
        { seeds: 2, failures: 1, durationMs: 2 },
      );
      expect(metrics.map((metric) => metric.key)).toEqual(['seeds', 'failures', 'durationMs']);
    });

    it('treats an absent side as zero rather than a hole', () => {
      const metrics = buildRunMetricDeltas(
        { seeds: 10, failures: 1, durationMs: 100 },
        { seeds: 10, failures: 1, durationMs: 100, coveragePercent: 40 },
      );
      const coverage = metrics.find((metric) => metric.key === 'coveragePercent');
      expect(coverage).toMatchObject({ base: 0, candidate: 40 });
    });

    it('treats equal values as flat', () => {
      const metrics = buildRunMetricDeltas(
        { seeds: 5, failures: 1, durationMs: 10 },
        { seeds: 5, failures: 1, durationMs: 10 },
      );
      expect(metrics.every((metric) => metric.direction === 'flat')).toBe(true);
    });
  });

  describe('compareSides', () => {
    it('wraps both sides and their delta', () => {
      const base: ComparisonSide = {
        runId: 'run-1',
        label: 'baseline',
        signatures: samples(['sig-a', 1]),
        metrics: { seeds: 1, failures: 1, durationMs: 100 },
      };
      const candidate: ComparisonSide = {
        runId: 'run-2',
        label: 'candidate',
        signatures: samples(['sig-b', 1]),
        metrics: { seeds: 1, failures: 1, durationMs: 90 },
      };

      const result = compareSides(base, candidate);
      expect(result.base.runId).toBe('run-1');
      expect(result.candidate.runId).toBe('run-2');
      expect(result.delta.added[0]?.signature).toBe('sig-b');
      expect(result.delta.removed[0]?.signature).toBe('sig-a');
    });
  });
});
