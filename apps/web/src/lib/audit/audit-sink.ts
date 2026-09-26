/**
 * Process-wide audit sink (#1431).
 *
 * Call sites reach the log through `recordAuditEvent`, which never throws: a
 * failure to write the audit trail must not block the action being audited.
 * That is a deliberate availability-over-attribution trade — a dropped entry is
 * preferable to a maintainer unable to delete a run. Chain breaks caused by a
 * dropped write surface in the viewer's integrity check.
 */

import { safeStorage } from "../local-storage";

import {
  AuditLog,
  createInMemoryAuditGateway,
  type AuditEntry,
  type AuditEntryInput,
  type AuditGateway,
} from './audit-log';

export const AUDIT_STORAGE_KEY = 'crashlab:audit-log:v1';

export function parseAuditEntries(raw: string | null): AuditEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Browser-backed when a `window` exists, in-memory otherwise — the same call
 * site works on the server and in tests without special-casing.
 */
export function createDefaultAuditGateway(): AuditGateway {
  if (typeof window === 'undefined') return createInMemoryAuditGateway();

  return {
    load: () => parseAuditEntries(safeStorage.getItem(AUDIT_STORAGE_KEY)),
    save: (entries) => {
      safeStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries));
    },
  };
}

let singleton: AuditLog | null = null;

export function getAuditLog(): AuditLog {
  if (!singleton) singleton = new AuditLog({ gateway: createDefaultAuditGateway() });
  return singleton;
}

/** Reset between tests. */
export function resetAuditLog(): void {
  singleton = null;
}

/** The call-site entry point. Swallows storage failures by design. */
export function recordAuditEvent(input: AuditEntryInput): void {
  try {
    getAuditLog().append(input);
  } catch {
    // Auditing must never break the action it is recording.
  }
}
