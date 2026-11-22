/**
 * lib/triage/bulk — batch mutations with per-item outcomes (#1878).
 *
 * Bulk actions are the reason the queue exists: a maintainer selects forty
 * rows, assigns them, and expects either forty audit-stamped updates or a
 * precise list of the ones that could not move. There is no all-or-nothing
 * transaction here — one stale row must not block the other thirty-nine — so
 * the result carries `updated`, `unchanged` and `failed` separately, plus the
 * audit records for everything that actually changed.
 */

import { transitionTriageItem } from './state-machine';
import {
  MAX_BULK_IDS,
  isTriagePriority,
  isTriageStatus,
  snapshotOf,
  type TriageItemState,
  type TriagePriority,
  type TriageSnapshot,
  type TriageStatus,
} from './types';

export interface BulkTriageRequest {
  /** Deduplicated before use; order is preserved for deterministic output. */
  ids: string[];
  status?: TriageStatus;
  /** `null` unassigns. */
  assignee?: string | null;
  priority?: TriagePriority;
  actor: string;
  orgId?: string;
  now?: string;
}

export type BulkTriageFailureCode =
  | 'not-found'
  | 'forbidden'
  | 'invalid-status'
  | 'invalid-priority'
  | 'invalid-transition'
  | 'invalid-assignee'
  | 'empty-mutation';

export interface BulkTriageFailure {
  id: string;
  code: BulkTriageFailureCode;
  message: string;
}

export interface TriageAuditRecord {
  action: 'triage.status' | 'triage.assign' | 'triage.priority' | 'triage.bulk';
  itemId: string;
  actor: string;
  at: string;
  before: TriageSnapshot;
  after: TriageSnapshot;
  orgId?: string;
}

export interface BulkTriageResult {
  /** The full collection after the batch, so a caller can persist it as-is. */
  items: TriageItemState[];
  updated: TriageItemState[];
  unchanged: TriageItemState[];
  failed: BulkTriageFailure[];
  audit: TriageAuditRecord[];
  progress: {
    requested: number;
    updated: number;
    unchanged: number;
    failed: number;
    /** 0–100, rounded down so "100%" is never shown before completion. */
    percentComplete: number;
  };
}

export type BulkTriageParse =
  | { ok: true; request: BulkTriageRequest }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a decoded JSON body. Kept next to the model (not in the route) so
 * the rules can be unit-tested without constructing a `NextRequest`.
 */
export function parseBulkTriageRequest(body: unknown): BulkTriageParse {
  if (!isRecord(body)) return { ok: false, message: 'Expected a JSON object body.' };

  const rawIds = body.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, message: 'Select at least one triage item.' };
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of rawIds) {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { ok: false, message: 'Every selected id must be a non-empty string.' };
    }
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (ids.length > MAX_BULK_IDS) {
    return { ok: false, message: `A bulk action may touch at most ${MAX_BULK_IDS} items.` };
  }

  const actor = typeof body.actor === 'string' ? body.actor.trim() : '';
  if (!actor) return { ok: false, message: 'An actor is required for an audited mutation.' };

  const hasStatus = body.status !== undefined;
  const hasAssignee = body.assignee !== undefined;
  const hasPriority = body.priority !== undefined;
  if (!hasStatus && !hasAssignee && !hasPriority) {
    return { ok: false, message: 'Choose a status, assignee or priority to apply.' };
  }

  const request: BulkTriageRequest = { ids, actor };

  if (hasStatus) {
    if (!isTriageStatus(body.status)) return { ok: false, message: `Unknown triage status: ${String(body.status)}.` };
    request.status = body.status;
  }

  if (hasPriority) {
    if (!isTriagePriority(body.priority)) {
      return { ok: false, message: `Unknown triage priority: ${String(body.priority)}.` };
    }
    request.priority = body.priority;
  }

  if (hasAssignee) {
    if (body.assignee !== null && typeof body.assignee !== 'string') {
      return { ok: false, message: 'Assignee must be a string or null.' };
    }
    request.assignee = body.assignee as string | null;
  }

  if (body.orgId !== undefined) {
    if (typeof body.orgId !== 'string' || body.orgId.trim().length === 0) {
      return { ok: false, message: 'orgId must be a non-empty string when supplied.' };
    }
    request.orgId = body.orgId.trim();
  }

  if (body.now !== undefined) {
    if (typeof body.now !== 'string' || Number.isNaN(Date.parse(body.now))) {
      return { ok: false, message: 'now must be an ISO timestamp when supplied.' };
    }
    request.now = body.now;
  }

  return { ok: true, request };
}

function auditActionFor(fields: ReadonlyArray<'status' | 'assignee' | 'priority'>): TriageAuditRecord['action'] {
  if (fields.length > 1) return 'triage.bulk';
  if (fields[0] === 'assignee') return 'triage.assign';
  if (fields[0] === 'priority') return 'triage.priority';
  return 'triage.status';
}

/**
 * Applies one mutation to every requested id.
 *
 * Unknown ids and cross-organisation ids are reported as failures rather than
 * silently dropped: the caller selected them, so the caller is told they were
 * not applied. Duplicate ids are collapsed by `parseBulkTriageRequest`.
 */
export function applyBulkTriage(
  items: readonly TriageItemState[],
  request: BulkTriageRequest,
): BulkTriageResult {
  const byId = new Map(items.map((item) => [item.id, item]));
  const nextItems = items.map((item) => item);
  const updated: TriageItemState[] = [];
  const unchanged: TriageItemState[] = [];
  const failed: BulkTriageFailure[] = [];
  const audit: TriageAuditRecord[] = [];

  for (const id of request.ids) {
    const item = byId.get(id);
    if (!item) {
      failed.push({ id, code: 'not-found', message: `No triage item with id ${id}.` });
      continue;
    }
    if (request.orgId !== undefined && item.orgId !== request.orgId) {
      failed.push({ id, code: 'forbidden', message: 'That item belongs to another organisation.' });
      continue;
    }

    const transition = transitionTriageItem(item, {
      ...(request.status !== undefined ? { status: request.status } : {}),
      ...(request.assignee !== undefined ? { assignee: request.assignee } : {}),
      ...(request.priority !== undefined ? { priority: request.priority } : {}),
      actor: request.actor,
      ...(request.now !== undefined ? { now: request.now } : {}),
    });

    if (!transition.ok) {
      failed.push({ id, code: transition.code, message: transition.message });
      continue;
    }

    if (!transition.changed) {
      unchanged.push(item);
      continue;
    }

    const index = nextItems.findIndex((candidate) => candidate.id === id);
    if (index >= 0) nextItems[index] = transition.item;
    updated.push(transition.item);

    audit.push({
      action: auditActionFor(transition.fields),
      itemId: id,
      actor: transition.item.updatedBy ?? request.actor,
      at: transition.item.updatedAt,
      before: transition.before,
      after: transition.after,
      ...(transition.item.orgId ? { orgId: transition.item.orgId } : {}),
    });
  }

  const requested = request.ids.length;
  const percentComplete =
    requested === 0 ? 100 : Math.floor(((updated.length + unchanged.length) / requested) * 100);

  return {
    items: nextItems,
    updated,
    unchanged,
    failed,
    audit,
    progress: {
      requested,
      updated: updated.length,
      unchanged: unchanged.length,
      failed: failed.length,
      percentComplete,
    },
  };
}

/** Convenience for a single-row action; keeps the API shape identical. */
export function bulkRequestForItem(
  id: string,
  mutation: Omit<BulkTriageRequest, 'ids'>,
): BulkTriageRequest {
  return { ...mutation, ids: [id] };
}

export { snapshotOf };
