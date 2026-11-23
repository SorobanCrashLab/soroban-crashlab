import { describe, expect, it } from 'vitest';
import {
  deserializeDocument,
  documentFingerprint,
  normalizeNewlines,
  serializeDocument,
  stableStringify,
} from './serialization';
import type { ReportDocument } from './types';

function doc(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'report-1',
    title: 'Example',
    markdown: '# Heading\n\nText',
    revision: 3,
    updatedAt: '2026-11-21T10:00:00Z',
    embeds: {},
    comments: [],
    ...overrides,
  };
}

describe('deterministic serialization', () => {
  it('normalizes CRLF and lone CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc');
    expect(doc({ markdown: 'a\r\nb' }).markdown).not.toBe(serializeDocument(doc({ markdown: 'a\r\nb' })));
    const parsed = deserializeDocument(serializeDocument(doc({ markdown: 'a\r\nb' })));
    expect(parsed?.markdown).toBe('a\nb');
  });

  it('sorts object keys recursively while preserving array order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(stableStringify({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it('produces identical output for differently ordered embeds and comments', () => {
    const first = doc({
      embeds: {
        b: { id: 'b', type: 'trace', entityId: 't-2', mode: 'live' },
        a: { id: 'a', type: 'run', entityId: 'r-1', mode: 'live' },
      },
      comments: [
        { id: 'c2', anchor: 'x', author: '@b', body: 'second', createdAt: '2026-01-02T00:00:00Z', resolved: false, mentions: [] },
        { id: 'c1', anchor: 'x', author: '@a', body: 'first', createdAt: '2026-01-01T00:00:00Z', resolved: false, mentions: [] },
      ],
    });
    const second = doc({
      embeds: {
        a: { id: 'a', type: 'run', entityId: 'r-1', mode: 'live' },
        b: { id: 'b', type: 'trace', entityId: 't-2', mode: 'live' },
      },
      comments: [...first.comments].reverse(),
    });
    expect(serializeDocument(first)).toBe(serializeDocument(second));
    expect(documentFingerprint(first)).toBe(documentFingerprint(second));
  });

  it('round-trips through validation and rejects malformed JSON', () => {
    const original = doc();
    expect(deserializeDocument(serializeDocument(original))).toEqual(original);
    expect(deserializeDocument('{not json')).toBeNull();
    expect(deserializeDocument('{"schemaVersion":99}')).toBeNull();
  });

  it('changes the fingerprint when content changes', () => {
    expect(documentFingerprint(doc())).not.toBe(documentFingerprint(doc({ markdown: 'different' })));
  });
});
