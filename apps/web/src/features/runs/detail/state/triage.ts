/**
 * Inline triage state machine for the run detail workspace (#2257).
 * Transitions are explicit so optimistic updates can be validated before they
 * are sent to the API, and audit events can be derived deterministically.
 */

export const TRIAGE_STATUSES = ['open', 'investigating', 'confirmed', 'dismissed', 'resolved'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export interface TriageRecord {
  status: TriageStatus;
  assignee: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical';
  note: string;
  updatedAt: string;
}

export const ALLOWED_TRANSITIONS: Record<TriageStatus, readonly TriageStatus[]> = {
  open: ['investigating', 'dismissed', 'resolved'],
  investigating: ['confirmed', 'dismissed', 'open', 'resolved'],
  confirmed: ['investigating', 'resolved'],
  dismissed: ['open'],
  resolved: ['open', 'investigating'],
};

export function canTransition(from: TriageStatus, to: TriageStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export interface TriagePatch {
  status?: TriageStatus;
  assignee?: string | null;
  priority?: TriageRecord['priority'];
  note?: string;
}

export function applyTriagePatch(record: TriageRecord, patch: TriagePatch, now: string): TriageRecord {
  if (patch.status && !canTransition(record.status, patch.status)) {
    throw new Error(`Invalid triage transition: ${record.status} -> ${patch.status}`);
  }
  return {
    status: patch.status ?? record.status,
    assignee: patch.assignee === undefined ? record.assignee : patch.assignee,
    priority: patch.priority ?? record.priority,
    note: patch.note === undefined ? record.note : patch.note.slice(0, 2000),
    updatedAt: now,
  };
}

export function triageAuditAction(before: TriageRecord, after: TriageRecord): string {
  const changes: string[] = [];
  if (before.status !== after.status) changes.push(`status:${after.status}`);
  if (before.assignee !== after.assignee) changes.push(`assignee:${after.assignee ?? 'none'}`);
  if (before.priority !== after.priority) changes.push(`priority:${after.priority}`);
  if (changes.length === 0) changes.push('note');
  return `triage.${changes.join(',')}`;
}
