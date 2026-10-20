/**
 * lib/triage/state-machine — the only way a queue item changes (#1878).
 *
 * The workflow is intentionally small and explicit:
 *
 *   new ──▶ triaged ──▶ in-progress ──▶ resolved
 *    │          │            │              │
 *    │          └────────────┴──────────────┘
 *    └──────────────────────────────────────▶ resolved
 *   resolved ──▶ new (reopen)
 *
 * A status that is not on an edge is rejected with a code the API can return
 * verbatim, and the item is returned untouched. Assigning or re-prioritising
 * is allowed from any state. Re-applying the current value is an idempotent
 * no-op (`changed: false`) rather than an error, which is what makes bulk
 * retries safe.
 */

import {
  MAX_ASSIGNEE_LENGTH,
  isTriagePriority,
  isTriageStatus,
  snapshotOf,
  type TriageItemState,
  type TriagePriority,
  type TriageSnapshot,
  type TriageStatus,
} from './types';

export const TRIAGE_TRANSITIONS: Record<TriageStatus, readonly TriageStatus[]> = {
  new: ['triaged', 'resolved'],
  triaged: ['new', 'in-progress', 'resolved'],
  'in-progress': ['triaged', 'resolved'],
  resolved: ['new'],
};

export type TriageMutationError =
  | 'invalid-status'
  | 'invalid-priority'
  | 'invalid-transition'
  | 'invalid-assignee'
  | 'empty-mutation';

export interface TriageMutationInput {
  status?: TriageStatus;
  /** `null` unassigns; `undefined` leaves the assignee alone. */
  assignee?: string | null;
  priority?: TriagePriority;
  actor: string;
  /** ISO timestamp; defaults to now. Tests pass it explicitly. */
  now?: string;
}

export type TriageTransition =
  | {
      ok: true;
      item: TriageItemState;
      changed: boolean;
      before: TriageSnapshot;
      after: TriageSnapshot;
      /** Which fields actually moved. Empty when `changed` is false. */
      fields: Array<'status' | 'assignee' | 'priority'>;
    }
  | { ok: false; code: TriageMutationError; message: string };

const ASSIGNEE_PATTERN = /^[A-Za-z0-9._@+-]+$/;

export function canTransition(from: TriageStatus, to: TriageStatus): boolean {
  if (from === to) return true;
  return TRIAGE_TRANSITIONS[from].includes(to);
}

/**
 * Validates an assignee. Returns the normalised value or an error string.
 * Empty and whitespace-only strings are rejected (use `null` to unassign) so a
 * stray form submit cannot silently clear ownership.
 */
export function normaliseAssignee(value: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: 'An assignee is required — use unassign to clear ownership.' };
  }
  if (trimmed.length > MAX_ASSIGNEE_LENGTH) {
    return { ok: false, message: `An assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters.` };
  }
  if (!ASSIGNEE_PATTERN.test(trimmed)) {
    return { ok: false, message: 'An assignee may only contain letters, digits, dots, underscores, @ and +.' };
  }
  return { ok: true, value: trimmed };
}

function normaliseActor(actor: string): string {
  const trimmed = typeof actor === 'string' ? actor.trim() : '';
  return trimmed.length > 0 ? trimmed : 'system';
}

/**
 * Applies one mutation. Pure: the input item is never mutated, and every
 * accepted change bumps `version` and stamps `updatedAt`/`updatedBy`.
 */
export function transitionTriageItem(
  item: TriageItemState,
  input: TriageMutationInput,
): TriageTransition {
  const hasStatus = input.status !== undefined;
  const hasAssignee = input.assignee !== undefined;
  const hasPriority = input.priority !== undefined;

  if (!hasStatus && !hasAssignee && !hasPriority) {
    return { ok: false, code: 'empty-mutation', message: 'Nothing to update on this item.' };
  }

  if (hasStatus && !isTriageStatus(input.status)) {
    return { ok: false, code: 'invalid-status', message: `Unknown triage status: ${String(input.status)}.` };
  }
  if (hasPriority && !isTriagePriority(input.priority)) {
    return {
      ok: false,
      code: 'invalid-priority',
      message: `Unknown triage priority: ${String(input.priority)}.`,
    };
  }

  if (hasStatus && !canTransition(item.status, input.status as TriageStatus)) {
    return {
      ok: false,
      code: 'invalid-transition',
      message: `Cannot move an item from ${item.status} to ${String(input.status)}.`,
    };
  }

  let nextAssignee = item.assignee;
  if (hasAssignee) {
    if (input.assignee === null) {
      nextAssignee = undefined;
    } else {
      const parsed = normaliseAssignee(input.assignee as string);
      if (!parsed.ok) return { ok: false, code: 'invalid-assignee', message: parsed.message };
      nextAssignee = parsed.value;
    }
  }

  const nextPriority = hasPriority ? (input.priority as TriagePriority) : item.priority;
  const nextStatus = hasStatus ? (input.status as TriageStatus) : item.status;

  const fields: Array<'status' | 'assignee' | 'priority'> = [];
  if (nextStatus !== item.status) fields.push('status');
  if (nextAssignee !== item.assignee) fields.push('assignee');
  if (nextPriority !== item.priority) fields.push('priority');

  const before = snapshotOf(item);
  if (fields.length === 0) {
    // Idempotent: the requested value was already in place.
    return { ok: true, item, changed: false, before, after: before, fields: [] };
  }

  const next: TriageItemState = {
    ...item,
    status: nextStatus,
    priority: nextPriority,
    version: item.version + 1,
    updatedAt: input.now ?? new Date().toISOString(),
    updatedBy: normaliseActor(input.actor),
  };
  if (nextAssignee === undefined) delete next.assignee;
  else next.assignee = nextAssignee;

  return { ok: true, item: next, changed: true, before, after: snapshotOf(next), fields };
}
