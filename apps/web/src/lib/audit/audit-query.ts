/**
 * Server-side audit query and export (#1895, #1834).
 *
 * Every query is scoped to one org: an entry belongs to its `orgId`, and
 * entries without one (deployment-wide and pre-tenancy) belong to the default
 * org, matching the tenancy backfill. Pagination is keyset on `sequence`
 * (newest first), so a page boundary is stable while new entries arrive.
 * Cursors are opaque, versioned and bound to the org + filter set: replaying a
 * cursor against a different filter throws instead of returning misaligned pages.
 */

import { computeCursorScope } from '@/app/pagination-utils';
import type { AuditAction, AuditEntry } from './audit-log';
import { toCsv } from './audit-view-utils';

export const DEFAULT_AUDIT_ORG_ID = 'org_default';
export const MAX_AUDIT_PAGE_SIZE = 200;

/**
 * Thrown when a versioned audit cursor is replayed against a query whose
 * org or filters differ from the ones that issued it. The route maps this
 * to HTTP 400 (CURSOR_MISMATCH).
 */
export class AuditCursorMismatchError extends Error {
  constructor(message = 'Cursor does not match this query\'s sort/filter; restart pagination from page 1.') {
    super(message);
    this.name = 'AuditCursorMismatchError';
  }
}

/**
 * Audit retention is its own class, separate from artifact TTLs: records are
 * long-lived and the application has no delete path at all (append-only is
 * enforced at the gateway). Past the retention window entries may be archived
 * by an operator — export plus a signed checkpoint — never pruned in place.
 */
export const AUDIT_RETENTION_POLICY = Object.freeze({
  class: 'long-lived',
  minimumRetentionDays: 2555,
  deletion: 'none',
  archival: 'operator-export-with-checkpoint',
} as const);

export interface AuditQuery {
  actor?: string;
  action?: AuditAction;
  target?: string;
  /** ISO timestamps, inclusive. */
  since?: string;
  until?: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export function entryOrg(entry: AuditEntry): string {
  return entry.orgId ?? DEFAULT_AUDIT_ORG_ID;
}

export function encodeCursor(sequence: number): string {
  return Buffer.from(`seq:${sequence}`).toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null;
  const match = /^seq:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) throw new Error('invalid cursor');
  return Number(match[1]);
}

/**
 * Fingerprint binding a cursor to the org + filter set that issued it.
 * Identical queries always hash identically (sorted keys, empty-normalized).
 */
export function auditCursorScope(orgId: string, query: AuditQuery = {}): string {
  return computeCursorScope({
    route: 'audit',
    org: orgId,
    actor: query.actor ?? '',
    action: query.action ?? '',
    target: query.target ?? '',
    since: query.since ?? '',
    until: query.until ?? '',
  });
}

function encodeBoundAuditCursor(sequence: number, scope: string): string {
  return Buffer.from(JSON.stringify({ v: 2, seq: sequence, scope }), 'utf8').toString('base64url');
}

function decodeBoundAuditCursor(cursor: string, scope: string): number {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === 'object' && 'v' in parsed) {
    const candidate = parsed as { v?: unknown; seq?: unknown; scope?: unknown };
    if (candidate.v !== 2 || typeof candidate.seq !== 'number' || typeof candidate.scope !== 'string') {
      throw new Error('invalid cursor');
    }
    if (candidate.scope !== scope) {
      throw new AuditCursorMismatchError();
    }
    return candidate.seq;
  }
  // v1 unversioned `seq:<n>` cursor: still a correct keyset continuation
  // (sequence is unique and total-ordered); it just carries no scope proof.
  const legacy = decodeCursor(cursor);
  if (legacy === null) throw new Error('invalid cursor');
  return legacy;
}

/** All entries for `orgId` that match the filter, newest first. */
export function filterScopedEntries(entries: readonly AuditEntry[], orgId: string, query: AuditQuery = {}): AuditEntry[] {
  const actor = query.actor?.trim().toLowerCase();
  const target = query.target?.trim().toLowerCase();
  const since = query.since ? Date.parse(query.since) : undefined;
  const until = query.until ? Date.parse(query.until) : undefined;

  return entries
    .filter((entry) => {
      if (entryOrg(entry) !== orgId) return false;
      if (actor && !entry.actor.toLowerCase().includes(actor)) return false;
      if (query.action && entry.action !== query.action) return false;
      if (target && !entry.target.toLowerCase().includes(target)) return false;
      const at = Date.parse(entry.timestamp);
      if (since !== undefined && at < since) return false;
      if (until !== undefined && at > until) return false;
      return true;
    })
    .sort((a, b) => b.sequence - a.sequence);
}

export function queryAuditEntries(
  entries: readonly AuditEntry[],
  orgId: string,
  query: AuditQuery = {},
  page: { cursor?: string | null; limit?: number; scope?: string } = {},
): AuditPage {
  const limit = Math.min(Math.max(1, page.limit ?? 50), MAX_AUDIT_PAGE_SIZE);
  const after = page.cursor
    ? page.scope
      ? decodeBoundAuditCursor(page.cursor, page.scope)
      : decodeCursor(page.cursor)
    : null;
  const matchingAll = filterScopedEntries(entries, orgId, query);
  const matching = after === null ? matchingAll : matchingAll.filter((entry) => entry.sequence < after);
  const items = matching.slice(0, limit);
  const hasMore = matching.length > limit;
  const lastSequence = items.length > 0 ? items[items.length - 1].sequence : null;
  const nextCursor =
    hasMore && lastSequence !== null
      ? page.scope
        ? encodeBoundAuditCursor(lastSequence, page.scope)
        : encodeCursor(lastSequence)
      : null;
  return {
    items,
    total: matchingAll.length,
    nextCursor,
    hasMore,
  };
}

export type AuditExportFormat = 'csv' | 'json';

export function exportAuditEntries(
  entries: readonly AuditEntry[],
  orgId: string,
  format: AuditExportFormat,
  query: AuditQuery = {},
): { body: string; contentType: string; filename: string } {
  const scoped = filterScopedEntries(entries, orgId, query);
  if (format === 'json') {
    return {
      body: JSON.stringify({ orgId, exportedCount: scoped.length, entries: scoped }, null, 2),
      contentType: 'application/json',
      filename: `crashlab-audit-${orgId}.json`,
    };
  }
  return { body: toCsv(scoped), contentType: 'text/csv', filename: `crashlab-audit-${orgId}.csv` };
}
