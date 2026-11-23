/** Conflict-safe revision handling for reports. */
import { diffLines, type DiffLine } from './diff';
import { canonicalizeDocument, documentFingerprint, documentsEqual } from './serialization';
import type { ReportDocument, ReportRecord, ReportRevision } from './types';

export type RevisionFailure = 'stale-base' | 'base-ahead' | 'unchanged';

export type RevisionResult =
  | { status: 'ok'; document: ReportDocument }
  | {
      status: 'conflict';
      reason: Exclude<RevisionFailure, 'unchanged'>;
      currentFingerprint: string;
      incomingFingerprint: string;
    }
  | { status: 'noop'; reason: 'unchanged' };

export interface RevisionRequest {
  baseRevision: number;
  candidate: ReportDocument;
  /** Only used by the explicit local-overwrite action. */
  force?: boolean;
  /** Manual "save version" actions create a revision even without content changes. */
  allowEmpty?: boolean;
}

/**
 * Compare-and-swap style update. A save is accepted only when the submitted
 * base revision matches the server revision, unless explicitly forced.
 */
export function resolveRevision(
  current: ReportDocument,
  request: RevisionRequest,
): RevisionResult {
  const candidate = canonicalizeDocument(request.candidate);
  const currentFingerprint = documentFingerprint(current);
  const incomingFingerprint = documentFingerprint(candidate);

  if (!request.allowEmpty && documentsEqual(current, candidate)) {
    return { status: 'noop', reason: 'unchanged' };
  }

  if (!request.force) {
    if (request.baseRevision < current.revision) {
      return { status: 'conflict', reason: 'stale-base', currentFingerprint, incomingFingerprint };
    }
    if (request.baseRevision > current.revision) {
      return { status: 'conflict', reason: 'base-ahead', currentFingerprint, incomingFingerprint };
    }
  }

  return {
    status: 'ok',
    document: canonicalizeDocument({
      ...candidate,
      id: current.id,
      revision: current.revision + 1,
      updatedAt: candidate.updatedAt ?? new Date().toISOString(),
    }),
  };
}

export function createRevision(
  document: ReportDocument,
  author: string,
  message: string,
  createdAt: string = new Date().toISOString(),
): ReportRevision {
  return {
    revision: document.revision,
    createdAt,
    author,
    message,
    document: canonicalizeDocument(document),
  };
}

/** Append a revision entry, keeping the list ordered and de-duplicated. */
export function appendRevision(record: ReportRecord, revision: ReportRevision): ReportRecord {
  const without = record.revisions.filter((entry) => entry.revision !== revision.revision);
  return {
    document: revision.document,
    revisions: [...without, revision].sort((left, right) => left.revision - right.revision),
  };
}

export function findRevision(record: ReportRecord, revision: number): ReportRevision | undefined {
  return record.revisions.find((entry) => entry.revision === revision);
}

/**
 * Build a document from a historical revision. The revision number is bumped
 * by `resolveRevision` when the restore is saved, so history is never erased.
 */
export function restoreRevisionSource(
  record: ReportRecord,
  revision: number,
): ReportDocument | null {
  const source = findRevision(record, revision);
  if (!source) return null;
  return canonicalizeDocument({
    ...source.document,
    revision: record.document.revision,
    updatedAt: new Date().toISOString(),
  });
}

export interface RevisionComparison {
  left: ReportRevision | null;
  right: ReportRevision | null;
  diff: DiffLine[];
}

export function compareRevisions(
  record: ReportRecord,
  leftRevision: number,
  rightRevision: number,
): RevisionComparison {
  const left = findRevision(record, leftRevision) ?? null;
  const right = findRevision(record, rightRevision) ?? null;
  return {
    left,
    right,
    diff: diffLines(left?.document.markdown ?? '', right?.document.markdown ?? ''),
  };
}

export function formatRevisionLabel(revision: ReportRevision): string {
  return `r${revision.revision} · ${revision.author} · ${revision.message}`;
}
