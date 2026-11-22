/**
 * Block Kit message builder for crash triage (#1428).
 *
 * Produces the interactive message CrashLab posts for a crash: a summary, a
 * severity chip, and the triage buttons. Each button's `action_id` carries the
 * run and cluster it refers to plus a short HMAC tag, so a payload that arrives
 * with a hand-edited `action_id` is rejected before it can touch triage state.
 */

import { createHmac } from 'node:crypto';

export type SlackTriageAction = 'assign' | 'resolve';

export type CrashSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CrashSummary {
  runId: string;
  clusterId: string;
  title: string;
  severity: CrashSeverity;
  area: string;
  failureCount: number;
  /** Absolute dashboard URL for the "View run" button. */
  dashboardUrl: string;
}

export interface TriageActionRef {
  action: SlackTriageAction;
  runId: string;
  clusterId: string;
}

const ACTION_PREFIX = 'crashlab';
const TAG_LENGTH = 16;

const SEVERITY_CHIP: Record<CrashSeverity, string> = {
  low: ':white_circle: Low',
  medium: ':large_yellow_circle: Medium',
  high: ':large_orange_circle: High',
  critical: ':red_circle: Critical',
};

function actionTag(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, TAG_LENGTH);
}

/**
 * `crashlab:{action}:{runId}:{clusterId}:{tag}` with the refs percent-encoded
 * so an id containing `:` cannot forge extra fields.
 */
export function encodeActionId(ref: TriageActionRef, secret: string): string {
  const body = [ACTION_PREFIX, ref.action, encodeURIComponent(ref.runId), encodeURIComponent(ref.clusterId)].join(':');
  return `${body}:${actionTag(secret, body)}`;
}

export function decodeActionId(actionId: string, secret: string): TriageActionRef | null {
  const parts = actionId.split(':');
  if (parts.length !== 5) return null;

  const [prefix, action, runId, clusterId, tag] = parts;
  if (prefix !== ACTION_PREFIX) return null;
  if (action !== 'assign' && action !== 'resolve') return null;

  const body = [prefix, action, runId, clusterId].join(':');
  if (actionTag(secret, body) !== tag) return null;

  return {
    action,
    runId: decodeURIComponent(runId),
    clusterId: decodeURIComponent(clusterId),
  };
}

export interface TriageMessageState {
  assignee?: string;
  resolvedBy?: string;
}

/**
 * Builds the message blocks. Once a crash is resolved the triage buttons are
 * replaced by a resolution note, which is how a second click on a stale
 * message reads as a no-op rather than a competing action.
 */
export function buildTriageMessageBlocks(
  crash: CrashSummary,
  secret: string,
  state: TriageMessageState = {},
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Crash in ${crash.area}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${crash.title}*` },
      fields: [
        { type: 'mrkdwn', text: `*Severity*\n${SEVERITY_CHIP[crash.severity]}` },
        { type: 'mrkdwn', text: `*Failures*\n${crash.failureCount}` },
        { type: 'mrkdwn', text: `*Run*\n\`${crash.runId}\`` },
        { type: 'mrkdwn', text: `*Cluster*\n\`${crash.clusterId}\`` },
      ],
    },
  ];

  if (state.resolvedBy) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:white_check_mark: Resolved by <@${state.resolvedBy}>` }],
    });
  } else if (state.assignee) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:bust_in_silhouette: Assigned to <@${state.assignee}>` }],
    });
  }

  const elements: unknown[] = [];
  if (!state.resolvedBy) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Assign to me', emoji: true },
      action_id: encodeActionId({ action: 'assign', runId: crash.runId, clusterId: crash.clusterId }, secret),
    });
    elements.push({
      type: 'button',
      style: 'primary',
      text: { type: 'plain_text', text: 'Resolve', emoji: true },
      action_id: encodeActionId({ action: 'resolve', runId: crash.runId, clusterId: crash.clusterId }, secret),
    });
  }
  elements.push({
    type: 'button',
    text: { type: 'plain_text', text: 'View run', emoji: true },
    url: crash.dashboardUrl,
    action_id: 'crashlab:open-dashboard',
  });

  blocks.push({ type: 'actions', elements });
  return blocks;
}
