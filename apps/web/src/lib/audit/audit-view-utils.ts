/**
 * Filtering, pagination and CSV export for the audit viewer (#1431).
 * Pure, so the exported file and the rendered table cannot disagree.
 */

import type { AuditAction, AuditEntry } from './audit-log';

export const AUDIT_PAGE_SIZE = 25;

export interface AuditFilter {
  actor?: string;
  action?: AuditAction | 'all';
  target?: string;
  /** ISO date (inclusive) lower bound. */
  since?: string;
}

export function filterAuditEntries(
  entries: readonly AuditEntry[],
  filter: AuditFilter = {},
): AuditEntry[] {
  const actor = filter.actor?.trim().toLowerCase();
  const target = filter.target?.trim().toLowerCase();
  const since = filter.since ? Date.parse(filter.since) : undefined;

  return entries.filter((entry) => {
    if (actor && !entry.actor.toLowerCase().includes(actor)) return false;
    if (filter.action && filter.action !== 'all' && entry.action !== filter.action) return false;
    if (target && !entry.target.toLowerCase().includes(target)) return false;
    if (since !== undefined && Date.parse(entry.timestamp) < since) return false;
    return true;
  });
}

export function pageCount(total: number, pageSize: number = AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageOf<T>(items: readonly T[], page: number, pageSize: number = AUDIT_PAGE_SIZE): T[] {
  const safePage = Math.min(Math.max(1, page), pageCount(items.length, pageSize));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * RFC 4180 escaping. The leading-character guard stops a spreadsheet treating
 * a field as a formula — an audit export is exactly the kind of file someone
 * opens in Excel.
 */
export function escapeCsvField(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const prefixed = dangerous ? `'${value}` : value;
  if (/[",\n\r]/.test(prefixed)) {
    return `"${prefixed.replace(/"/g, '""')}"`;
  }
  return prefixed;
}

export const AUDIT_CSV_HEADERS = [
  'sequence',
  'timestamp',
  'actor',
  'action',
  'target',
  'metadata',
  'hash',
] as const;

export function toCsv(entries: readonly AuditEntry[]): string {
  const rows = entries.map((entry) =>
    [
      String(entry.sequence),
      entry.timestamp,
      entry.actor,
      entry.action,
      entry.target,
      JSON.stringify(entry.metadata),
      entry.hash,
    ]
      .map(escapeCsvField)
      .join(','),
  );

  return [AUDIT_CSV_HEADERS.join(','), ...rows].join('\n');
}
