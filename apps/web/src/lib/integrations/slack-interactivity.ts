/**
 * Slack interactivity loop for crash triage (#1428).
 *
 * Slack gives an app 3 seconds to respond to a button click, so the handler
 * verifies the signature, acknowledges, and hands the actual triage work to a
 * deferred task. Infrastructure assumption: HTTP Request URL only — no socket
 * mode — so the only entry point is the route this module backs.
 */

import {
  buildTriageMessageBlocks,
  decodeActionId,
  encodeActionId,
  type CrashSummary,
  type SlackTriageAction,
  type TriageActionRef,
} from './slack-blocks';
import { signSlackRequest, verifySlackRequest } from './slack-signature';

export interface TriageRecord {
  runId: string;
  clusterId: string;
  assignee?: string;
  assignedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export type TriageOutcome =
  | 'assigned'
  | 'reassigned'
  | 'resolved'
  | 'already-resolved'
  | 'invalid-action';

export interface TriageStore {
  get(runId: string, clusterId: string): TriageRecord | undefined;
  set(record: TriageRecord): void;
  all(): TriageRecord[];
}

export function triageKey(runId: string, clusterId: string): string {
  return `${runId}::${clusterId}`;
}

export function createInMemoryTriageStore(): TriageStore {
  const records = new Map<string, TriageRecord>();
  return {
    get: (runId, clusterId) => records.get(triageKey(runId, clusterId)),
    set: (record) => {
      records.set(triageKey(record.runId, record.clusterId), record);
    },
    all: () => Array.from(records.values()),
  };
}

export interface TriageActionInput {
  ref: TriageActionRef;
  actor: string;
  now: string;
}

export interface TriageActionResult {
  outcome: TriageOutcome;
  record: TriageRecord;
}

/**
 * Applies one button click.
 *
 * Resolve is idempotent: a crash that already carries a resolver keeps it, so
 * a double-click — or Slack retrying a delivery — cannot overwrite the first
 * resolver or fire the resolution twice.
 */
export function applyTriageAction(
  store: TriageStore,
  input: TriageActionInput,
): TriageActionResult {
  const { ref, actor, now } = input;
  const existing = store.get(ref.runId, ref.clusterId) ?? {
    runId: ref.runId,
    clusterId: ref.clusterId,
  };

  if (ref.action === 'resolve') {
    if (existing.resolvedBy) {
      return { outcome: 'already-resolved', record: existing };
    }
    const record: TriageRecord = { ...existing, resolvedBy: actor, resolvedAt: now };
    store.set(record);
    return { outcome: 'resolved', record };
  }

  const outcome: TriageOutcome = existing.assignee ? 'reassigned' : 'assigned';
  const record: TriageRecord = { ...existing, assignee: actor, assignedAt: now };
  store.set(record);
  return { outcome, record };
}

// ── Payload parsing ──────────────────────────────────────────────────────────

import { z } from 'zod';
import { SlackInteractionPayloadSchema } from '../schemas/integrations/slack';
import { logger } from '../logger';

export type SlackInteractionPayload = z.infer<typeof SlackInteractionPayloadSchema>;

/** Slack posts interactivity as a form body: `payload=<url-encoded JSON>`. */
export function parseInteractivityBody(body: string): SlackInteractionPayload | { error: string } {
  try {
    const encoded = new URLSearchParams(body).get('payload');
    if (!encoded) return { error: 'Missing payload parameter' };
    const parsed: unknown = JSON.parse(encoded);
    
    const validation = SlackInteractionPayloadSchema.safeParse(parsed);
    if (!validation.success) {
      return { error: validation.error.message };
    }
    return validation.data;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'JSON parse error' };
  }
}

export function encodeInteractivityBody(payload: SlackInteractionPayload): string {
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
}

// ── Fast-ack handler ─────────────────────────────────────────────────────────

export interface InteractivityRequest {
  body: string;
  signature: string | null;
  timestamp: string | null;
}

export interface InteractivityOptions {
  secret: string | undefined;
  store: TriageStore;
  nowSeconds: number;
  now?: () => string;
  /**
   * Schedules the triage work. The handler never awaits it, which is what
   * keeps the acknowledgement inside Slack's 3-second budget.
   */
  defer: (task: () => Promise<void> | void) => void;
}

export interface InteractivityAck {
  status: number;
  body: string;
  /** Set when the request failed verification, for the route to log a reason. */
  reason?: string;
  accepted: boolean;
}

export function handleInteractivityRequest(
  request: InteractivityRequest,
  options: InteractivityOptions,
): InteractivityAck {
  const verification = verifySlackRequest({
    secret: options.secret,
    signature: request.signature,
    timestamp: request.timestamp,
    body: request.body,
    nowSeconds: options.nowSeconds,
  });

  if (!verification.ok) {
    const status = verification.reason === 'not-configured' ? 503 : 401;
    return { status, body: '', reason: verification.reason, accepted: false };
  }

  const result = parseInteractivityBody(request.body);
  if ('error' in result) {
    logger.warn('Slack payload validation failed', { provider: 'slack', reason: result.error });
    return { status: 422, body: '', reason: 'invalid-payload', accepted: false };
  }
  const payload = result;

  const secret = options.secret as string;
  const actor = payload.user.username ?? payload.user.id;
  const nowIso = options.now?.() ?? new Date().toISOString();

  // Everything past this point is deferred: decode, apply, update the message.
  options.defer(() => {
    for (const action of payload.actions) {
      const ref = decodeActionId(action.action_id, secret);
      // `open-dashboard` is a plain URL button — Slack still notifies, but
      // there is nothing to record.
      if (!ref) continue;
      applyTriageAction(options.store, { ref, actor, now: nowIso });
    }
  });

  return { status: 200, body: '', accepted: true };
}

// ── Mock interactivity simulator ─────────────────────────────────────────────

export interface MockInteractivity {
  secret: string;
  store: TriageStore;
  /** Signs and delivers a button click, then settles the deferred work. */
  click(input: {
    action: SlackTriageAction;
    crash: CrashSummary;
    userId: string;
    username?: string;
    timestampSeconds?: number;
  }): Promise<InteractivityAck>;
  /** Current Block Kit blocks for a crash, reflecting recorded triage state. */
  blocksFor(crash: CrashSummary): unknown[];
}

/**
 * Drives the whole loop without Slack: build blocks, click a button, verify the
 * signature, apply the action, re-render. Used by tests and by mock mode in the
 * demo environment.
 */
export function createMockInteractivity(options: { secret?: string; now?: () => string } = {}): MockInteractivity {
  const secret = options.secret ?? 'mock-slack-signing-secret';
  const store = createInMemoryTriageStore();
  const pending: Array<Promise<void>> = [];

  return {
    secret,
    store,
    async click({ action, crash, userId, username, timestampSeconds }) {
      const nowSeconds = timestampSeconds ?? Math.floor(Date.now() / 1000);
      const blocks = buildTriageMessageBlocks(crash, secret, {
        assignee: store.get(crash.runId, crash.clusterId)?.assignee,
        resolvedBy: store.get(crash.runId, crash.clusterId)?.resolvedBy,
      });
      const actionId = findActionId(blocks, action, crash, secret);
      const body = encodeInteractivityBody({
        type: 'block_actions',
        user: { id: userId, username },
        actions: [{ action_id: actionId }],
      });
      const timestamp = String(nowSeconds);
      const ack = handleInteractivityRequest(
        { body, signature: signSlackRequest(secret, timestamp, body), timestamp },
        {
          secret,
          store,
          nowSeconds,
          now: options.now,
          defer: (task) => {
            pending.push(Promise.resolve().then(task));
          },
        },
      );
      await Promise.all(pending.splice(0, pending.length));
      return ack;
    },
    blocksFor(crash) {
      const record = store.get(crash.runId, crash.clusterId);
      return buildTriageMessageBlocks(crash, secret, {
        assignee: record?.assignee,
        resolvedBy: record?.resolvedBy,
      });
    },
  };
}

/**
 * Pulls the `action_id` a real user's click would carry out of the rendered
 * blocks, so the simulator exercises the ids the builder actually emitted.
 * Falls back to a freshly encoded id once the buttons are gone (resolved
 * message), which is how the double-resolve case is reproduced.
 */
function findActionId(
  blocks: unknown[],
  action: SlackTriageAction,
  crash: CrashSummary,
  secret: string,
): string {
  for (const block of blocks) {
    const candidate = block as { type?: string; elements?: Array<{ action_id?: string }> };
    if (candidate.type !== 'actions' || !candidate.elements) continue;
    for (const element of candidate.elements) {
      const id = element.action_id;
      if (!id) continue;
      const ref = decodeActionId(id, secret);
      if (ref?.action === action) return id;
    }
  }
  return encodeActionId({ action, runId: crash.runId, clusterId: crash.clusterId }, secret);
}
