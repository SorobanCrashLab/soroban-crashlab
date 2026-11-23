/** Deterministic serialization helpers used for drafts, diffs and revisions. */
import { ReportDocumentSchema } from './schema';
import { REPORT_DOCUMENT_VERSION, type ReportDocument } from './types';

/** Normalize CRLF/CR to LF so identical text always hashes identically. */
export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/**
 * JSON.stringify with lexicographically sorted object keys. Arrays keep their
 * order because order is meaningful for Markdown blocks and comments.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

/** Canonical in-memory form: normalized Markdown and stable comment order. */
export function canonicalizeDocument(document: ReportDocument): ReportDocument {
  return {
    ...document,
    schemaVersion: REPORT_DOCUMENT_VERSION,
    markdown: normalizeNewlines(document.markdown),
    embeds: Object.keys(document.embeds)
      .sort()
      .reduce<Record<string, ReportDocument['embeds'][string]>>((acc, key) => {
        acc[key] = document.embeds[key];
        return acc;
      }, {}),
    comments: [...document.comments].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  };
}

/** The single canonical wire/storage representation of a report document. */
export function serializeDocument(document: ReportDocument): string {
  return stableStringify(canonicalizeDocument(document));
}

/** Parse and validate a previously serialized document. */
export function deserializeDocument(raw: string): ReportDocument | null {
  try {
    return ReportDocumentSchema.parse(canonicalizeDocument(JSON.parse(raw) as ReportDocument));
  } catch {
    return null;
  }
}

/** Small, fast, deterministic fingerprint for equality checks (FNV-1a 32-bit). */
export function documentFingerprint(document: ReportDocument): string {
  const text = serializeDocument(document);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function documentsEqual(left: ReportDocument, right: ReportDocument): boolean {
  return documentFingerprint(left) === documentFingerprint(right);
}
