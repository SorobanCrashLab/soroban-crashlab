/**
 * lib/triage/audit — every accepted queue mutation leaves a trail (#1878).
 *
 * The bulk model produces the records (it is the only thing that knows the
 * before/after pair); this module is the single write path into the append-only
 * audit log. Keeping it separate means a test can inject a log with a frozen
 * clock and assert exactly what would be stored.
 */

import { AuditLog, type AuditEntry } from '@/lib/audit/audit-log';
import type { TriageAuditRecord } from './bulk';

/** Process-wide audit log for triage mutations. */
export const triageAuditLog = new AuditLog();

/**
 * Appends the batch to `log` (defaults to the shared log). Returns the stored
 * entries so a caller can surface sequence numbers in a response if needed.
 */
export function recordTriageAudit(
  records: readonly TriageAuditRecord[],
  log: AuditLog = triageAuditLog,
): AuditEntry[] {
  return records.map((record) =>
    log.append({
      action: record.action,
      target: record.itemId,
      actor: record.actor,
      metadata: {
        before: record.before,
        after: record.after,
      },
      ...(record.orgId ? { orgId: record.orgId } : {}),
    }),
  );
}
