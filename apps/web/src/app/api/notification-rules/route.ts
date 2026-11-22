/**
 * /api/notification-rules — Unified Notification Rules Builder, Throttling,
 * Deduplication, Maintenance Windows, Deterministic Simulation, and Governance (#2316).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type NotificationEventSource =
  | 'crashes'
  | 'regressions'
  | 'ci_gates'
  | 'incidents'
  | 'data_quality';

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type PredicateOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'contains' | 'in';

export interface RulePredicate {
  field: string;
  operator: PredicateOperator;
  value: string | number | string[];
}

export type NotificationChannelType =
  | 'in_app'
  | 'email'
  | 'slack'
  | 'pagerduty'
  | 'webhook';

export interface NotificationActionTarget {
  channel: NotificationChannelType;
  recipient: string;
  template: string;
  sensitiveTarget?: boolean;
}

export interface ThrottlingConfig {
  dedupWindowSeconds: number;
  groupingKeys: string[];
  maxDeliveriesPerHour: number;
  cooldownSeconds: number;
}

export interface MaintenanceWindow {
  id: string;
  label: string;
  workspace: string;
  startIso: string;
  endIso: string;
  suppressSources: NotificationEventSource[];
  active: boolean;
}

export type RolloutStage = 'disabled' | 'dry_run' | 'canary_25' | 'active';
export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved';

export interface NotificationRule {
  id: string;
  workspace: string;
  name: string;
  description: string;
  eventSource: NotificationEventSource;
  minSeverity: NotificationSeverity;
  predicates: RulePredicate[];
  actions: NotificationActionTarget[];
  throttling: ThrottlingConfig;
  escalationPolicyId?: string;
  scheduleId?: string;
  enabled: boolean;
  rolloutStage: RolloutStage;
  version: number;
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PolicyAuditLogEntry {
  id: string;
  at: string;
  workspace: string;
  actor: string;
  actorRole: 'analyst' | 'maintainer';
  action: string;
  targetId: string;
  version: number;
  diffSummary: string;
}

export interface SampleSimulationEvent {
  id: string;
  workspace: string;
  eventSource: NotificationEventSource;
  severity: NotificationSeverity;
  timestampIso: string;
  fingerprint: string;
  attributes: Record<string, string | number>;
  recentCountInHour?: number;
  duplicateWithinWindow?: boolean;
}

export interface RuleSimulationDeliveryPreview {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  suppressed: boolean;
  suppressionReasons: string[];
  matchedActions: Array<{
    channel: NotificationChannelType;
    recipient: string;
    renderedPayload: string;
  }>;
  escalationPolicyId?: string;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Safe anti-storm throttling defaults enforced when fields are omitted or out of bounds. */
export const SAFE_DEFAULT_THROTTLING: ThrottlingConfig = {
  dedupWindowSeconds: 300,
  groupingKeys: ['contract', 'signature'],
  maxDeliveriesPerHour: 30,
  cooldownSeconds: 120,
};

export function normalizeThrottlingConfig(
  raw?: Partial<ThrottlingConfig>,
): ThrottlingConfig {
  const dedup =
    typeof raw?.dedupWindowSeconds === 'number' && Number.isFinite(raw.dedupWindowSeconds)
      ? Math.max(30, Math.min(86400, Math.round(raw.dedupWindowSeconds)))
      : SAFE_DEFAULT_THROTTLING.dedupWindowSeconds;
  const maxPerHour =
    typeof raw?.maxDeliveriesPerHour === 'number' &&
    Number.isFinite(raw.maxDeliveriesPerHour)
      ? Math.max(1, Math.min(200, Math.round(raw.maxDeliveriesPerHour)))
      : SAFE_DEFAULT_THROTTLING.maxDeliveriesPerHour;
  const cooldown =
    typeof raw?.cooldownSeconds === 'number' && Number.isFinite(raw.cooldownSeconds)
      ? Math.max(15, Math.min(86400, Math.round(raw.cooldownSeconds)))
      : SAFE_DEFAULT_THROTTLING.cooldownSeconds;
  const groupingKeys =
    Array.isArray(raw?.groupingKeys) && raw.groupingKeys.length > 0
      ? raw.groupingKeys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : [...SAFE_DEFAULT_THROTTLING.groupingKeys];

  return {
    dedupWindowSeconds: dedup,
    groupingKeys,
    maxDeliveriesPerHour: maxPerHour,
    cooldownSeconds: cooldown,
  };
}

/** Evaluates a single rule predicate deterministically against event attributes. */
export function evaluateRulePredicate(
  predicate: RulePredicate,
  attributes: Record<string, string | number>,
): boolean {
  const actual = attributes[predicate.field];
  if (actual === undefined) return false;

  switch (predicate.operator) {
    case 'eq':
      return String(actual) === String(predicate.value);
    case 'neq':
      return String(actual) !== String(predicate.value);
    case 'gte':
      return Number(actual) >= Number(predicate.value);
    case 'lte':
      return Number(actual) <= Number(predicate.value);
    case 'contains':
      return String(actual)
        .toLowerCase()
        .includes(String(predicate.value).toLowerCase());
    case 'in': {
      const list = Array.isArray(predicate.value)
        ? predicate.value.map(String)
        : String(predicate.value)
            .split(',')
            .map((s) => s.trim());
      return list.includes(String(actual));
    }
  }
}

/** Renders a templated payload (`{{field}}` placeholders) deterministically. */
export function renderTemplatedPayload(
  template: string,
  event: SampleSimulationEvent,
  rule: NotificationRule,
): string {
  const vars: Record<string, string> = {
    rule: rule.name,
    source: event.eventSource,
    severity: event.severity,
    fingerprint: event.fingerprint,
    workspace: event.workspace,
    timestamp: event.timestampIso,
  };
  for (const [k, v] of Object.entries(event.attributes)) {
    vars[k] = String(v);
  }
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
  });
}

/** Computes a deterministic human-readable diff summary between two rule versions. */
export function computeRuleVersionDiff(
  prev: NotificationRule,
  next: NotificationRule,
): string {
  const diffs: string[] = [];
  if (prev.name !== next.name) diffs.push(`name: "${prev.name}" -> "${next.name}"`);
  if (prev.minSeverity !== next.minSeverity)
    diffs.push(`minSeverity: ${prev.minSeverity} -> ${next.minSeverity}`);
  if (prev.enabled !== next.enabled)
    diffs.push(`enabled: ${String(prev.enabled)} -> ${String(next.enabled)}`);
  if (prev.rolloutStage !== next.rolloutStage)
    diffs.push(`rolloutStage: ${prev.rolloutStage} -> ${next.rolloutStage}`);
  if (prev.approvalStatus !== next.approvalStatus)
    diffs.push(`approvalStatus: ${prev.approvalStatus} -> ${next.approvalStatus}`);
  if (prev.actions.length !== next.actions.length)
    diffs.push(`actions: ${prev.actions.length} -> ${next.actions.length}`);
  if (prev.predicates.length !== next.predicates.length)
    diffs.push(`predicates: ${prev.predicates.length} -> ${next.predicates.length}`);
  if (
    prev.throttling.maxDeliveriesPerHour !== next.throttling.maxDeliveriesPerHour
  ) {
    diffs.push(
      `maxDeliveriesPerHour: ${prev.throttling.maxDeliveriesPerHour} -> ${next.throttling.maxDeliveriesPerHour}`,
    );
  }
  return diffs.length > 0 ? diffs.join('; ') : 'metadata refresh';
}

/**
 * Deterministic rule evaluation and delivery simulator matching backend semantics.
 */
export function simulateRulesAgainstEvent(
  rules: readonly NotificationRule[],
  event: SampleSimulationEvent,
  maintenanceWindows: readonly MaintenanceWindow[] = [],
  options: { quietHoursActive?: boolean } = {},
): RuleSimulationDeliveryPreview[] {
  const eventTs = Date.parse(event.timestampIso);

  return rules
    .filter((r) => r.workspace === event.workspace || r.workspace === 'global')
    .map((rule) => {
      const suppressionReasons: string[] = [];

      if (!rule.enabled || rule.rolloutStage === 'disabled') {
        suppressionReasons.push('Rule is disabled');
      }
      if (rule.rolloutStage === 'dry_run') {
        suppressionReasons.push('Staged rollout in dry_run mode (logged only)');
      }

      const sourceMatch = rule.eventSource === event.eventSource;
      const severityMatch =
        SEVERITY_RANK[event.severity] >= SEVERITY_RANK[rule.minSeverity];
      const predicatesMatch = rule.predicates.every((p) =>
        evaluateRulePredicate(p, event.attributes),
      );
      const matched = sourceMatch && severityMatch && predicatesMatch;

      if (matched) {
        for (const mw of maintenanceWindows) {
          if (!mw.active) continue;
          if (mw.workspace !== 'global' && mw.workspace !== event.workspace) continue;
          const start = Date.parse(mw.startIso);
          const end = Date.parse(mw.endIso);
          if (
            !Number.isNaN(eventTs) &&
            eventTs >= start &&
            eventTs <= end &&
            mw.suppressSources.includes(event.eventSource)
          ) {
            suppressionReasons.push(`Suppressed by maintenance window "${mw.label}"`);
          }
        }

        if (event.duplicateWithinWindow) {
          suppressionReasons.push(
            `Deduplicated within ${rule.throttling.dedupWindowSeconds}s window (fingerprint ${event.fingerprint})`,
          );
        }

        if (
          typeof event.recentCountInHour === 'number' &&
          event.recentCountInHour >= rule.throttling.maxDeliveriesPerHour
        ) {
          suppressionReasons.push(
            `Throttled: hourly rate limit (${rule.throttling.maxDeliveriesPerHour}/hr) reached`,
          );
        }

        if (options.quietHoursActive && event.severity !== 'critical') {
          suppressionReasons.push(
            'Suppressed by active quiet-hours schedule (non-critical event)',
          );
        }
      }

      const suppressed = !matched || suppressionReasons.length > 0;
      const matchedActions = matched
        ? rule.actions.map((act) => ({
            channel: act.channel,
            recipient: act.recipient,
            renderedPayload: renderTemplatedPayload(act.template, event, rule),
          }))
        : [];

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched,
        suppressed,
        suppressionReasons,
        matchedActions,
        escalationPolicyId: rule.escalationPolicyId,
      };
    });
}

interface NotificationRulesStore {
  rules: NotificationRule[];
  maintenanceWindows: MaintenanceWindow[];
  auditHistory: PolicyAuditLogEntry[];
  seq: number;
}

function createSeededRulesStore(): NotificationRulesStore {
  const now = new Date().toISOString();
  return {
    seq: 4,
    rules: [
      {
        id: 'rule-0001',
        workspace: 'global',
        name: 'Critical Contract Crash & Reentrancy Pager',
        description:
          'Routes high/critical Soroban fuzzing crashes with new signatures to PagerDuty and Slack.',
        eventSource: 'crashes',
        minSeverity: 'high',
        predicates: [
          { field: 'is_new_signature', operator: 'eq', value: 'true' },
          { field: 'crash_count', operator: 'gte', value: 1 },
        ],
        actions: [
          {
            channel: 'pagerduty',
            recipient: 'pd-service-soroban-sec',
            template: '[{{severity}}] New crash {{fingerprint}} on {{contract}}',
            sensitiveTarget: true,
          },
          {
            channel: 'slack',
            recipient: '#soroban-crash-alerts',
            template: '🚨 *{{rule}}*: `{{contract}}` failed ({{fingerprint}})',
          },
        ],
        throttling: {
          dedupWindowSeconds: 600,
          groupingKeys: ['contract', 'signature'],
          maxDeliveriesPerHour: 20,
          cooldownSeconds: 180,
        },
        escalationPolicyId: 'esc-0001',
        scheduleId: 'sched-0001',
        enabled: true,
        rolloutStage: 'active',
        version: 2,
        approvalStatus: 'approved',
        approvedBy: 'sec-lead',
        updatedBy: 'maintainer-ops',
        updatedAt: now,
      },
      {
        id: 'rule-0002',
        workspace: 'global',
        name: 'CI Release Gate Regression Digest',
        description:
          'Notifies release owners via Slack and email when a CI gate or perf budget regresses.',
        eventSource: 'ci_gates',
        minSeverity: 'medium',
        predicates: [{ field: 'gate_status', operator: 'eq', value: 'fail' }],
        actions: [
          {
            channel: 'slack',
            recipient: '#release-readiness',
            template: '⚠️ CI Gate regression on {{branch}}: {{summary}}',
          },
          {
            channel: 'email',
            recipient: 'release-owners@crashlab.internal',
            template: 'CI Gate failure detected in workspace {{workspace}} ({{fingerprint}})',
          },
        ],
        throttling: {
          dedupWindowSeconds: 900,
          groupingKeys: ['branch', 'gate'],
          maxDeliveriesPerHour: 15,
          cooldownSeconds: 300,
        },
        escalationPolicyId: 'esc-0002',
        scheduleId: 'sched-0001',
        enabled: true,
        rolloutStage: 'active',
        version: 1,
        approvalStatus: 'approved',
        approvedBy: 'release-captain',
        updatedBy: 'release-captain',
        updatedAt: now,
      },
      {
        id: 'rule-0003',
        workspace: 'triage-ops',
        name: 'Data Quality & Telemetry Drift Webhook',
        description: 'Streams schema drift alerts to the observability webhook.',
        eventSource: 'data_quality',
        minSeverity: 'medium',
        predicates: [{ field: 'drift_pct', operator: 'gte', value: 5 }],
        actions: [
          {
            channel: 'webhook',
            recipient: 'https://hooks.crashlab.internal/telemetry-drift',
            template: '{"rule":"{{rule}}","severity":"{{severity}}","drift":"{{drift_pct}}"}',
            sensitiveTarget: true,
          },
          {
            channel: 'in_app',
            recipient: 'team:data-platform',
            template: 'Telemetry drift {{drift_pct}}% detected on {{source}}',
          },
        ],
        throttling: { ...SAFE_DEFAULT_THROTTLING },
        enabled: true,
        rolloutStage: 'canary_25',
        version: 1,
        approvalStatus: 'pending_approval',
        updatedBy: 'analyst-triage',
        updatedAt: now,
      },
    ],
    maintenanceWindows: [
      {
        id: 'mw-0001',
        label: 'Scheduled Testnet Ledger Upgrade Window',
        workspace: 'global',
        startIso: '2026-12-01T02:00:00.000Z',
        endIso: '2026-12-01T04:00:00.000Z',
        suppressSources: ['ci_gates', 'data_quality'],
        active: false,
      },
    ],
    auditHistory: [
      {
        id: 'audit-0001',
        at: now,
        workspace: 'global',
        actor: 'sec-lead',
        actorRole: 'maintainer',
        action: 'rule.approved',
        targetId: 'rule-0001',
        version: 2,
        diffSummary: 'approvalStatus: pending_approval -> approved; rolloutStage: canary_25 -> active',
      },
    ],
  };
}

const globalForRules = globalThis as unknown as {
  __notificationRulesStore?: NotificationRulesStore;
};

function getRulesStore(): NotificationRulesStore {
  if (!globalForRules.__notificationRulesStore) {
    globalForRules.__notificationRulesStore = createSeededRulesStore();
  }
  return globalForRules.__notificationRulesStore;
}

export async function GET(req: NextRequest) {
  const store = getRulesStore();
  const p = req.nextUrl.searchParams;
  const workspace = p.get('workspace')?.trim() || '';
  const source = p.get('eventSource')?.trim() || '';
  const q = p.get('q')?.trim().toLowerCase() || '';

  const filtered = store.rules.filter((rule) => {
    if (workspace && workspace !== 'all' && rule.workspace !== workspace && rule.workspace !== 'global') {
      return false;
    }
    if (source && source !== 'all' && rule.eventSource !== source) {
      return false;
    }
    if (
      q &&
      !rule.name.toLowerCase().includes(q) &&
      !rule.description.toLowerCase().includes(q) &&
      !rule.id.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  return NextResponse.json({
    rules: filtered,
    total: filtered.length,
    maintenanceWindows: store.maintenanceWindows,
    auditHistory: store.auditHistory.slice(0, 100),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const store = getRulesStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Action 1: Deterministic rule simulation against a sample or historical event
  if (body.kind === 'simulate') {
    const rawEvent = body.event as Partial<SampleSimulationEvent> | undefined;
    if (!rawEvent || typeof rawEvent !== 'object') {
      return NextResponse.json({ error: '`event` object is required for simulation.' }, { status: 400 });
    }
    const sampleEvent: SampleSimulationEvent = {
      id: typeof rawEvent.id === 'string' ? rawEvent.id : 'sim-ev-1',
      workspace: typeof rawEvent.workspace === 'string' ? rawEvent.workspace : 'global',
      eventSource: (rawEvent.eventSource as NotificationEventSource) ?? 'crashes',
      severity: (rawEvent.severity as NotificationSeverity) ?? 'critical',
      timestampIso:
        typeof rawEvent.timestampIso === 'string'
          ? rawEvent.timestampIso
          : new Date().toISOString(),
      fingerprint:
        typeof rawEvent.fingerprint === 'string'
          ? rawEvent.fingerprint
          : 'sig-reentrancy-001',
      attributes:
        rawEvent.attributes && typeof rawEvent.attributes === 'object'
          ? rawEvent.attributes
          : { contract: 'token.swap', is_new_signature: 'true', crash_count: 3 },
      recentCountInHour:
        typeof rawEvent.recentCountInHour === 'number' ? rawEvent.recentCountInHour : 0,
      duplicateWithinWindow: Boolean(rawEvent.duplicateWithinWindow),
    };

    const previews = simulateRulesAgainstEvent(
      store.rules,
      sampleEvent,
      store.maintenanceWindows,
      { quietHoursActive: Boolean(body.quietHoursActive) },
    );

    return NextResponse.json({
      event: sampleEvent,
      previews,
      matchedCount: previews.filter((p) => p.matched && !p.suppressed).length,
      suppressedCount: previews.filter((p) => p.matched && p.suppressed).length,
    });
  }

  // Action 2: Maintenance window toggle / creation
  if (body.kind === 'maintenance-window') {
    const mwId = typeof body.id === 'string' ? body.id : '';
    const existing = store.maintenanceWindows.find((m) => m.id === mwId);
    if (existing && typeof body.active === 'boolean') {
      existing.active = body.active;
      return NextResponse.json({ maintenanceWindow: existing });
    }
    store.seq += 1;
    const createdMw: MaintenanceWindow = {
      id: `mw-${String(store.seq).padStart(4, '0')}`,
      label:
        typeof body.label === 'string' && body.label.trim()
          ? body.label.trim()
          : 'Maintenance Window',
      workspace: typeof body.workspace === 'string' ? body.workspace : 'global',
      startIso:
        typeof body.startIso === 'string' ? body.startIso : new Date().toISOString(),
      endIso:
        typeof body.endIso === 'string'
          ? body.endIso
          : new Date(Date.now() + 3600_000).toISOString(),
      suppressSources: Array.isArray(body.suppressSources)
        ? (body.suppressSources as NotificationEventSource[])
        : ['ci_gates'],
      active: Boolean(body.active ?? true),
    };
    store.maintenanceWindows.unshift(createdMw);
    return NextResponse.json({ maintenanceWindow: createdMw }, { status: 201 });
  }

  // Action 3: Create a new notification rule with RBAC & safe anti-storm defaults
  const actorRole: 'analyst' | 'maintainer' =
    body.actorRole === 'maintainer' ? 'maintainer' : 'analyst';
  const actor =
    typeof body.actor === 'string' && body.actor.trim()
      ? body.actor.trim()
      : 'analyst-user';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Rule `name` is required.' }, { status: 400 });
  }

  const actions: NotificationActionTarget[] = Array.isArray(body.actions)
    ? (body.actions as NotificationActionTarget[])
    : [
        {
          channel: 'in_app',
          recipient: 'team:triage',
          template: '[{{severity}}] {{rule}} triggered on {{source}}',
        },
      ];

  const hasSensitiveTarget = actions.some(
    (a) => a.sensitiveTarget || a.channel === 'pagerduty' || a.channel === 'webhook',
  );
  if (hasSensitiveTarget && actorRole !== 'maintainer') {
    return NextResponse.json(
      {
        error:
          'RBAC violation: configuring sensitive targets (PagerDuty / external webhooks) requires the maintainer role.',
      },
      { status: 403 },
    );
  }

  store.seq += 1;
  const now = new Date().toISOString();
  const newRule: NotificationRule = {
    id: `rule-${String(store.seq).padStart(4, '0')}`,
    workspace: typeof body.workspace === 'string' ? body.workspace : 'global',
    name,
    description:
      typeof body.description === 'string' ? body.description.trim() : '',
    eventSource: (body.eventSource as NotificationEventSource) ?? 'crashes',
    minSeverity: (body.minSeverity as NotificationSeverity) ?? 'high',
    predicates: Array.isArray(body.predicates)
      ? (body.predicates as RulePredicate[])
      : [],
    actions,
    throttling: normalizeThrottlingConfig(
      body.throttling as Partial<ThrottlingConfig> | undefined,
    ),
    escalationPolicyId:
      typeof body.escalationPolicyId === 'string'
        ? body.escalationPolicyId
        : 'esc-0001',
    scheduleId:
      typeof body.scheduleId === 'string' ? body.scheduleId : 'sched-0001',
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    rolloutStage: (body.rolloutStage as RolloutStage) ?? 'canary_25',
    version: 1,
    approvalStatus: actorRole === 'maintainer' ? 'approved' : 'pending_approval',
    approvedBy: actorRole === 'maintainer' ? actor : undefined,
    updatedBy: actor,
    updatedAt: now,
  };

  store.rules.unshift(newRule);
  store.auditHistory.unshift({
    id: `audit-${String(store.seq).padStart(4, '0')}`,
    at: now,
    workspace: newRule.workspace,
    actor,
    actorRole,
    action: 'rule.created',
    targetId: newRule.id,
    version: 1,
    diffSummary: `Created rule "${newRule.name}" (${newRule.rolloutStage})`,
  });

  return NextResponse.json({ rule: newRule }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const store = getRulesStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const ruleId = typeof body.id === 'string' ? body.id : '';
  const existing = store.rules.find((r) => r.id === ruleId);
  if (!existing) {
    return NextResponse.json({ error: 'Notification rule not found.' }, { status: 404 });
  }

  const actorRole: 'analyst' | 'maintainer' =
    body.actorRole === 'maintainer' ? 'maintainer' : 'analyst';
  const actor =
    typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'user';

  if (body.approvalStatus === 'approved' && actorRole !== 'maintainer') {
    return NextResponse.json(
      { error: 'RBAC violation: only a maintainer can approve a notification rule.' },
      { status: 403 },
    );
  }

  const snapshotBefore: NotificationRule = {
    ...existing,
    throttling: { ...existing.throttling },
    actions: [...existing.actions],
    predicates: [...existing.predicates],
  };

  if (typeof body.name === 'string' && body.name.trim()) {
    existing.name = body.name.trim();
  }
  if (typeof body.description === 'string') {
    existing.description = body.description.trim();
  }
  if (typeof body.enabled === 'boolean') {
    existing.enabled = body.enabled;
  }
  if (typeof body.minSeverity === 'string') {
    existing.minSeverity = body.minSeverity as NotificationSeverity;
  }
  if (typeof body.rolloutStage === 'string') {
    existing.rolloutStage = body.rolloutStage as RolloutStage;
  }
  if (typeof body.approvalStatus === 'string') {
    existing.approvalStatus = body.approvalStatus as ApprovalStatus;
    if (existing.approvalStatus === 'approved') {
      existing.approvedBy = actor;
    }
  }
  if (body.throttling && typeof body.throttling === 'object') {
    existing.throttling = normalizeThrottlingConfig({
      ...existing.throttling,
      ...(body.throttling as Partial<ThrottlingConfig>),
    });
  }

  existing.version += 1;
  existing.updatedBy = actor;
  existing.updatedAt = new Date().toISOString();

  const diffSummary = computeRuleVersionDiff(snapshotBefore, existing);
  store.seq += 1;
  store.auditHistory.unshift({
    id: `audit-${String(store.seq).padStart(4, '0')}`,
    at: existing.updatedAt,
    workspace: existing.workspace,
    actor,
    actorRole,
    action: 'rule.updated',
    targetId: existing.id,
    version: existing.version,
    diffSummary,
  });

  return NextResponse.json({ rule: existing, diffSummary });
}
