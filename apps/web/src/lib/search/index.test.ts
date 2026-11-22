import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { RunSearchIndex } from './index';
import type { SearchDocument, SearchSeverity } from './ranker';

const DOCUMENT_COUNT = 100_000;
const NOW = Date.UTC(2026, 9, 20);
const DAY = 86_400_000;
const SEVERITIES: SearchSeverity[] = ['low', 'medium', 'high', 'critical'];

function buildDocuments(count: number): SearchDocument[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `run-${index.toString().padStart(6, '0')}`;
    return {
      id,
      fields: [
        { key: 'id', label: 'Run ID', value: id },
        {
          key: 'signature',
          label: 'Crash Signature',
          value: `sig:contract${index % 50}:method${index % 20}:overflow`,
        },
        { key: 'tags', label: 'Tags', value: `tag${index % 100} regression` },
      ],
      timestamp: NOW - (index % 365) * DAY,
      count: index % 1_000,
      severity: SEVERITIES[index % SEVERITIES.length],
    };
  });
}

const documents = buildDocuments(DOCUMENT_COUNT);
const index = new RunSearchIndex();
const buildStartedAt = performance.now();
index.addDocuments(documents);
const buildMs = performance.now() - buildStartedAt;

describe('RunSearchIndex', () => {
  it('indexes 100k documents within the indexing budget', () => {
    expect(index.size).toBe(DOCUMENT_COUNT);
    expect(buildMs).toBeLessThan(5_000);
  });

  it('answers an exact id query within the latency budget', () => {
    const startedAt = performance.now();
    const result = index.search('run-099999', { now: NOW, limit: 50 });
    const elapsed = performance.now() - startedAt;

    expect(result.hits[0]?.document.id).toBe('run-099999');
    expect(result.total).toBe(1);
    expect(elapsed).toBeLessThan(250);
  });

  it('answers a typo-tolerant query within the latency budget', () => {
    const startedAt = performance.now();
    const result = index.search('run-09999O', { now: NOW, limit: 50 });
    const elapsed = performance.now() - startedAt;

    expect(result.hits[0]?.document.id).toBe('run-099999');
    expect(elapsed).toBeLessThan(350);
  });

  it('bounds a broad query to the top 200 results within the latency budget', () => {
    const startedAt = performance.now();
    const result = index.search('overflow', { now: NOW, limit: 200 });
    const elapsed = performance.now() - startedAt;

    expect(result.hits).toHaveLength(200);
    expect(result.total).toBe(DOCUMENT_COUNT);
    expect(result.truncated).toBe(true);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('removes and reindexes documents without stale hits', () => {
    const small = new RunSearchIndex();
    small.upsertDocument({
      id: 'run-a',
      fields: [{ key: 'id', label: 'Run ID', value: 'run-a' }],
    });
    small.upsertDocument({
      id: 'run-b',
      fields: [{ key: 'id', label: 'Run ID', value: 'run-old' }],
    });

    expect(small.search('run-a', { now: NOW }).hits).toHaveLength(1);
    small.removeDocument('run-a');
    expect(small.search('run-a', { now: NOW }).hits).toHaveLength(0);

    small.upsertDocument({
      id: 'run-b',
      fields: [{ key: 'id', label: 'Run ID', value: 'run-new' }],
    });
    expect(small.search('run-old', { now: NOW }).hits).toHaveLength(0);
    expect(small.search('run-new', { now: NOW }).hits[0]?.document.id).toBe('run-b');
  });

  it('returns no results for an unmatched query', () => {
    expect(index.search('zzzzzzzz', { now: NOW })).toEqual({
      hits: [],
      total: 0,
      truncated: false,
    });
  });
});
