/**
 * lib/triage/types — the persisted shape of a queue item (#1878).
 *
 * A queue item is the durable half of the triage board: the run id and
 * signature identify *what* is being triaged, the mutable fields record *who*
 * owns it and *where* it is in the workflow. Timestamps and versions are
 * server-assigned; the state machine is the only thing allowed to move them.
 */

export const TRIAGE_STATUSES = ['new', 'triaged', 'in-progress', 'resolved'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const TRIAGE_PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];

export const TRIAGE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TriageSeverity = (typeof TRIAGE_SEVERITIES)[number];

export const MAX_ASSIGNEE_LENGTH = 80;
export const MAX_BULK_IDS = 500;

export interface TriageItemState {
  /** Server-assigned, stable across status changes. */
  id: string;
  /** Owning organisation; a mutation from another org is refused. */
  orgId: string;
  /** Originating run id, so the queue can link back to the crash. */
  runId?: string;
  signature: string;
  failureClass: string;
  severity: TriageSeverity;
  occurrences: number;
  status: TriageStatus;
  priority: TriagePriority;
  assignee?: string;
  /** Incremented on every accepted change; lets the UI detect stale writes. */
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface TriageSnapshot {
  status: TriageStatus;
  priority: TriagePriority;
  assignee?: string;
}

export function isTriageStatus(value: unknown): value is TriageStatus {
  return typeof value === 'string' && (TRIAGE_STATUSES as readonly string[]).includes(value);
}

export function isTriagePriority(value: unknown): value is TriagePriority {
  return typeof value === 'string' && (TRIAGE_PRIORITIES as readonly string[]).includes(value);
}

export function snapshotOf(item: TriageItemState): TriageSnapshot {
  return {
    status: item.status,
    priority: item.priority,
    ...(item.assignee !== undefined ? { assignee: item.assignee } : {}),
  };
}

/** Human label for a status, used by both the board/queue and audit copy. */
export const TRIAGE_STATUS_LABELS: Record<TriageStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  'in-progress': 'In progress',
  resolved: 'Resolved',
};
