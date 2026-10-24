import { describe, expect, it } from 'vitest';
import {
  SEARCH_TRUNCATION_HINT,
  boundedEditDistance,
  maxEditDistanceFor,
  rankDocuments,
  type SearchDocument,
  type SearchSeverity,
} from './ranker';

const NOW = Date.UTC(2026, 9, 20);
const DAY = 86_400_000;

interface DocOverrides {
  signature?: string;
  tags?: string;
  daysAgo?: number;
  count?: number;
  severity?: SearchSeverity;
}

function doc(id: string, overrides: DocOverrides = {}): SearchDocument {
  return {
    id,
    fields: [
      { key: 'id', label: 'Run ID', value: id },
      { key: 'signature', label: 'Crash Signature', value: overrides.signature ?? '' },
      { key: 'tags', label: 'Tags', value: overrides.tags ?? '' },
    ],
    timestamp: NOW - (overrides.daysAgo ?? 0) * DAY,
    count: overrides.count ?? 0,
    severity: overrides.severity ?? 'low',
  };
}

function ids(documents: SearchDocument[]): string[] {
  return rankDocuments(documents, 'run', { now: NOW, limit: 10 }).hits.map(
    (hit) => hit.document.id,
  );
}

describe('rankDocuments', () => {
  it('returns no hits for an empty query', () => {
    expect(rankDocuments([doc('run-1')], '   ', { now: NOW })).toEqual({
      hits: [],
      total: 0,
      truncated: false,
    });
  });

  it('ranks an exact id match above a prefix match', () => {
    const exact = doc('run-1001', { daysAgo: 90, count: 0, severity: 'low' });
    const prefix = doc('run-1001-extra', { daysAgo: 0, count: 100_000, severity: 'critical' });

    const result = rankDocuments([prefix, exact], 'run-1001', { now: NOW });
    expect(result.hits.map((hit) => hit.document.id)).toEqual([
      'run-1001',
      'run-1001-extra',
    ]);
  });

  it('ranks prefix matches above fuzzy matches', () => {
    const prefix = doc('run-2001-extra', { daysAgo: 30 });
    const fuzzy = doc('run-2x01', { daysAgo: 0 });

    const result = rankDocuments([fuzzy, prefix], 'run-2001', { now: NOW });
    expect(result.hits[0].document.id).toBe('run-2001-extra');
    expect(result.hits[1].document.id).toBe('run-2x01');
  });

  it('tolerates a typo within a token', () => {
    const result = rankDocuments(
      [
        doc('run-1', { signature: 'sig:token:transfer:assert_balance_nonnegative' }),
        doc('run-2', { signature: 'sig:router:swap:budget_cpu_limit' }),
      ],
      'singature',
      { now: NOW },
    );

    expect(result.hits).toHaveLength(0);

    const withSignature = rankDocuments(
      [
        doc('run-3', { signature: 'sig:token:transfer:signature' }),
        doc('run-4', { signature: 'sig:router:swap:budget_cpu_limit' }),
      ],
      'singature',
      { now: NOW },
    );

    expect(withSignature.hits.map((hit) => hit.document.id)).toEqual(['run-3']);
  });

  it('breaks ties with a recency boost', () => {
    const older = doc('run-3001', { signature: 'sig:auth:retry', daysAgo: 40 });
    const newer = doc('run-3002', { signature: 'sig:auth:retry', daysAgo: 1 });

    const result = rankDocuments([older, newer], 'retry', { now: NOW });
    expect(result.hits.map((hit) => hit.document.id)).toEqual(['run-3002', 'run-3001']);
  });

  it('breaks ties with a count boost', () => {
    const rare = doc('run-4001', { signature: 'sig:state:overflow', count: 1 });
    const frequent = doc('run-4002', { signature: 'sig:state:overflow', count: 10_000 });

    const result = rankDocuments([rare, frequent], 'overflow', { now: NOW });
    expect(result.hits.map((hit) => hit.document.id)).toEqual(['run-4002', 'run-4001']);
  });

  it('breaks ties with a severity boost', () => {
    const low = doc('run-5001', { signature: 'sig:budget:limit', severity: 'low' });
    const critical = doc('run-5002', { signature: 'sig:budget:limit', severity: 'critical' });

    const result = rankDocuments([low, critical], 'limit', { now: NOW });
    expect(result.hits.map((hit) => hit.document.id)).toEqual(['run-5002', 'run-5001']);
  });

  it('caps results at the requested limit and reports the truncation hint', () => {
    const documents = Array.from({ length: 250 }, (_, index) =>
      doc(`run-${index.toString().padStart(4, '0')}`),
    );

    const result = rankDocuments(documents, 'run', { now: NOW, limit: 200 });
    expect(result.hits).toHaveLength(200);
    expect(result.total).toBe(250);
    expect(result.truncated).toBe(true);
    expect(result.hint).toBe(SEARCH_TRUNCATION_HINT);
  });

  it('returns matched field labels for the renderer', () => {
    const result = rankDocuments(
      [doc('run-6001', { signature: 'sig:auth:token' })],
      'token',
      { now: NOW },
    );

    expect(result.hits[0].matchedFields).toContainEqual({
      field: 'Crash Signature',
      value: 'sig:auth:token',
    });
  });
});

describe('boundedEditDistance', () => {
  it('returns the edit distance when within the bound', () => {
    expect(boundedEditDistance('signature', 'singature', 2)).toBe(2);
  });

  it('stops at max + 1 when the strings are too different', () => {
    expect(boundedEditDistance('signature', 'transfer', 1)).toBe(2);
    expect(boundedEditDistance('a', 'abcdefgh', 2)).toBe(3);
  });

  it('allows one edit for short tokens and two for long tokens', () => {
    expect(maxEditDistanceFor('run')).toBe(1);
    expect(maxEditDistanceFor('runs')).toBe(1);
    expect(maxEditDistanceFor('signature')).toBe(2);
    expect(maxEditDistanceFor('signature', 1)).toBe(1);
  });
});

describe('ranking stability', () => {
  it('sorts deterministically by id when scores and timestamps match', () => {
    const documents = [doc('run-7002'), doc('run-7001')];
    expect(ids(documents)).toEqual(['run-7001', 'run-7002']);
  });
});
