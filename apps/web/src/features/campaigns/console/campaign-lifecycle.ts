/**
 * Campaign lifecycle state machine + optimistic action handling (#2258).
 * Role checks happen before optimistic updates so unauthorized actions never
 * flash in the UI; a failed request is rolled back to the previous snapshot.
 */

export const CAMPAIGN_STATES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];
export type CampaignRole = 'viewer' | 'analyst' | 'maintainer';

export const STATE_TRANSITIONS: Record<CampaignState, readonly CampaignState[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['running', 'draft', 'cancelled'],
  running: ['paused', 'completed', 'cancelled'],
  paused: ['running', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export interface LifecycleSnapshot {
  state: CampaignState;
  scheduleId: string | null;
  updatedAt: string;
}

export interface LifecycleAction {
  type: CampaignState;
  actor: CampaignRole;
  at: string;
}

const ACTION_MIN_ROLE: Record<CampaignState, CampaignRole> = {
  draft: 'analyst',
  scheduled: 'analyst',
  running: 'analyst',
  paused: 'analyst',
  completed: 'analyst',
  cancelled: 'maintainer',
};

const ROLE_RANK: Record<CampaignRole, number> = { viewer: 0, analyst: 1, maintainer: 2 };

export function canManage(role: CampaignRole, target: CampaignState): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[ACTION_MIN_ROLE[target]];
}

export interface ActionResult {
  ok: boolean;
  reason?: 'forbidden' | 'invalid-transition';
  snapshot: LifecycleSnapshot;
}

export function applyLifecycleAction(snapshot: LifecycleSnapshot, action: LifecycleAction): ActionResult {
  if (!canManage(action.actor, action.type)) {
    return { ok: false, reason: 'forbidden', snapshot };
  }
  if (!STATE_TRANSITIONS[snapshot.state].includes(action.type)) {
    return { ok: false, reason: 'invalid-transition', snapshot };
  }
  return {
    ok: true,
    snapshot: { state: action.type, scheduleId: snapshot.scheduleId, updatedAt: action.at },
  };
}

export interface PendingAction {
  id: string;
  action: LifecycleAction;
  previous: LifecycleSnapshot;
}

/**
 * Apply an optimistic action and keep the previous snapshot so a failed API
 * call can be rolled back without re-fetching the whole campaign list.
 */
export function startOptimisticAction(snapshot: LifecycleSnapshot, action: LifecycleAction, id: string): {
  snapshot: LifecycleSnapshot;
  pending: PendingAction | null;
} {
  const result = applyLifecycleAction(snapshot, action);
  if (!result.ok) return { snapshot, pending: null };
  return { snapshot: result.snapshot, pending: { id, action, previous: snapshot } };
}

export function rollbackOptimisticAction(snapshot: LifecycleSnapshot, pending: PendingAction | null): LifecycleSnapshot {
  return pending ? pending.previous : snapshot;
}

export function lifecycleAuditAction(action: LifecycleAction): string {
  return `campaign.${action.type}`;
}
