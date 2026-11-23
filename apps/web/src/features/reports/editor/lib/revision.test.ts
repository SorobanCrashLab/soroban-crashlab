import { describe, expect, it } from 'vitest';
import {
  appendRevision,
  compareRevisions,
  createRevision,
  findRevision,
  resolveRevision,
  restoreRevisionSource,
} from './revision';
import type { ReportDocument, ReportRecord } from './types';

function doc(markdown: string, revision = 1): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'report-1',
    title: 'Report',
    markdown,
    revision,
    updatedAt: '2026-11-21T10:00:00Z',
    embeds: {},
    comments: [],
  };
}

describe('revision / conflict logic', () => {
  it('accepts a save based on the current revision and increments it', () => {
    const current = doc('one');
    const candidate = { ...doc('two'), updatedAt: '2026-11-21T10:01:00Z' };
    const result = resolveRevision(current, { baseRevision: 1, candidate });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.document.revision).toBe(2);
      expect(result.document.markdown).toBe('two');
    }
  });

  it('rejects stale and ahead base revisions', () => {
    const current = doc('current', 4);
    const stale = resolveRevision(current, { baseRevision: 2, candidate: doc('stale') });
    const ahead = resolveRevision(current, { baseRevision: 9, candidate: doc('ahead') });
    expect(stale).toMatchObject({ status: 'conflict', reason: 'stale-base' });
    expect(ahead).toMatchObject({ status: 'conflict', reason: 'base-ahead' });
  });

  it('reports no-op for identical content but allows explicit versions', () => {
    const current = doc('same');
    expect(resolveRevision(current, { baseRevision: 1, candidate: doc('same') })).toMatchObject({ status: 'noop' });
    expect(resolveRevision(current, { baseRevision: 1, candidate: doc('same'), allowEmpty: true }).status).toBe('ok');
  });

  it('honors the explicit force escape hatch', () => {
    const result = resolveRevision(doc('remote', 5), {
      baseRevision: 2,
      candidate: doc('local'),
      force: true,
    });
    expect(result.status).toBe('ok');
  });

  it('keeps history ordered and restores old content into a new revision', () => {
    const first = doc('first', 1);
    let record: ReportRecord = { document: first, revisions: [] };
    record = appendRevision(record, createRevision(first, '@a', 'initial', '2026-01-01T00:00:00Z'));
    const second = { ...doc('second', 2), updatedAt: '2026-01-02T00:00:00Z' };
    record = appendRevision({ ...record, document: second }, createRevision(second, '@b', 'edit', '2026-01-02T00:00:00Z'));

    expect(findRevision(record, 1)?.message).toBe('initial');
    const restored = restoreRevisionSource(record, 1);
    expect(restored?.markdown).toBe('first');
    expect(resolveRevision(record.document, { baseRevision: 2, candidate: restored! }).status).toBe('ok');
    expect(record.revisions.map((revision) => revision.revision)).toEqual([1, 2]);
  });

  it('builds a deterministic line diff for two revisions', () => {
    const record: ReportRecord = {
      document: doc('b', 2),
      revisions: [
        createRevision(doc('a', 1), '@a', 'one', '2026-01-01T00:00:00Z'),
        createRevision(doc('b', 2), '@b', 'two', '2026-01-02T00:00:00Z'),
      ],
    };
    const comparison = compareRevisions(record, 1, 2);
    expect(comparison.diff).toEqual([
      { type: 'remove', text: 'a', leftLine: 1 },
      { type: 'add', text: 'b', rightLine: 1 },
    ]);
  });
});
