/**
 * /api/escalation-policies — Escalation Policy Tiers, Timeouts, Fallback
 * Recipients, Acknowledgment/Resolve Lifecycle, and On-Call Routing Schedules (#2316).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { NotificationChannelType } from '../notification-rules/route';

export const dynamic = 'force-dynamic';

export interface EscalationTier {
  level: number;
  timeoutMinutes: number;
  targets: string[];
  channels: NotificationChannelType[];
  notifyOnCallScheduleId?: string;
}

export interface EscalationPolicy {
  id: string;
  workspace: string;
  name: string;
  description: string;
  tiers: EscalationTier[];
  fallbackRecipients: string[];
  repeatCount: number;
  autoResolveMinutes: number;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export type IncidentAckState = 'triggered' | 'acknowledged' | 'escalated' | 'resolved';

export interface ActiveEscalationIncident {
  id: string;
  policyId: string;
  ruleId: string;
  title: string;
  workspace: string;
  currentTierLevel: number;
  state: IncidentAckState;
  assignedTo: string;
  triggeredAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface OnCallRotationShift {
  dayOfWeek: string;
  primaryResponder: string;
  secondaryResponder: string;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHourUtc: number;
  endHourUtc: number;
  allowCriticalBypass: boolean;
}

export interface ScheduleOverride {
  id: string;
  responder: string;
  reason: string;
  startIso: string;
  endIso: string;
}

export interface RoutingSchedule {
  id: string;
  workspace: string;
  name: string;
  timezone: string;
  currentOnCall: string;
  backupOnCall: string;
  rotations: OnCallRotationShift[];
  quietHours: QuietHoursConfig;
  overrides: ScheduleOverride[];
  updatedAt: string;
}

/** Deterministically resolves the active on-call responder considering temporary overrides. */
export function resolveActiveOnCallResponder(
  schedule: RoutingSchedule,
  atIso: string = new Date().toISOString(),
): { responder: string; source: 'override' | 'rotation' } {
  const ts = Date.parse(atIso);
  if (!Number.isNaN(ts)) {
    for (const ov of schedule.overrides) {
      const start = Date.parse(ov.startIso);
      const end = Date.parse(ov.endIso);
      if (ts >= start && ts <= end) {
        return { responder: ov.responder, source: 'override' };
      }
    }
  }
  return { responder: schedule.currentOnCall, source: 'rotation' };
}

/** Evaluates whether quiet hours are currently active for a given UTC hour (`0..23`). */
export function isQuietHoursActive(
  quietHours: QuietHoursConfig,
  utcHour: number,
): boolean {
  if (!quietHours.enabled) return false;
  const h = ((utcHour % 24) + 24) % 24;
  if (quietHours.startHourUtc <= quietHours.endHourUtc) {
    return h >= quietHours.startHourUtc && h < quietHours.endHourUtc;
  }
  // Wraps across midnight UTC (e.g. 22:00 -> 06:00)
  return h >= quietHours.startHourUtc || h < quietHours.endHourUtc;
}

interface EscalationStore {
  policies: EscalationPolicy[];
  incidents: ActiveEscalationIncident[];
  schedules: RoutingSchedule[];
  seq: number;
}

function createSeededEscalationStore(): EscalationStore {
  const now = new Date().toISOString();
  return {
    seq: 3,
    policies: [
      {
        id: 'esc-0001',
        workspace: 'global',
        name: 'Soroban Security & Smart Contract Critical Escalation',
        description:
          '3-tier escalation path from primary contract on-call to security lead and incident commander.',
        tiers: [
          {
            level: 1,
            timeoutMinutes: 5,
            targets: ['oncall:contract-primary'],
            channels: ['pagerduty', 'slack'],
            notifyOnCallScheduleId: 'sched-0001',
          },
          {
            level: 2,
            timeoutMinutes: 15,
            targets: ['team:soroban-security-leads', '@sec-lead'],
            channels: ['pagerduty', 'slack', 'email'],
          },
          {
            level: 3,
            timeoutMinutes: 30,
            targets: ['role:incident-commander', 'vp-engineering@crashlab.internal'],
            channels: ['pagerduty', 'email'],
          },
        ],
        fallbackRecipients: ['noc-fallback@crashlab.internal', '#incident-war-room'],
        repeatCount: 2,
        autoResolveMinutes: 120,
        version: 1,
        updatedBy: 'sec-lead',
        updatedAt: now,
      },
      {
        id: 'esc-0002',
        workspace: 'global',
        name: 'Release Readiness & CI Gate Owner Escalation',
        description: '2-tier escalation for blocking release gates and performance regressions.',
        tiers: [
          {
            level: 1,
            timeoutMinutes: 15,
            targets: ['oncall:release-captain'],
            channels: ['slack', 'in_app'],
            notifyOnCallScheduleId: 'sched-0001',
          },
          {
            level: 2,
            timeoutMinutes: 45,
            targets: ['team:frontend-core', 'team:runtime-maintainers'],
            channels: ['slack', 'email'],
          },
        ],
        fallbackRecipients: ['release-engineering@crashlab.internal'],
        repeatCount: 1,
        autoResolveMinutes: 240,
        version: 1,
        updatedBy: 'release-captain',
        updatedAt: now,
      },
    ],
    incidents: [
      {
        id: 'inc-0001',
        policyId: 'esc-0001',
        ruleId: 'rule-0001',
        title: 'Critical reentrancy crash signature on token.swap (#run-1024)',
        workspace: 'global',
        currentTierLevel: 1,
        state: 'triggered',
        assignedTo: 'alice.oncall',
        triggeredAt: now,
      },
      {
        id: 'inc-0002',
        policyId: 'esc-0002',
        ruleId: 'rule-0002',
        title: 'Per-route bundle budget regression on /runs/[id]',
        workspace: 'global',
        currentTierLevel: 1,
        state: 'acknowledged',
        assignedTo: 'bob.release',
        triggeredAt: now,
        acknowledgedBy: 'bob.release',
        acknowledgedAt: now,
      },
    ],
    schedules: [
      {
        id: 'sched-0001',
        workspace: 'global',
        name: 'Primary Soroban Security & Triage Rotation',
        timezone: 'UTC',
        currentOnCall: 'alice.oncall',
        backupOnCall: 'carlos.sec',
        rotations: [
          {
            dayOfWeek: 'Mon–Wed',
            primaryResponder: 'alice.oncall',
            secondaryResponder: 'carlos.sec',
          },
          {
            dayOfWeek: 'Thu–Fri',
            primaryResponder: 'carlos.sec',
            secondaryResponder: 'dana.audit',
          },
          {
            dayOfWeek: 'Sat–Sun',
            primaryResponder: 'dana.audit',
            secondaryResponder: 'alice.oncall',
          },
        ],
        quietHours: {
          enabled: true,
          startHourUtc: 22,
          endHourUtc: 6,
          allowCriticalBypass: true,
        },
        overrides: [
          {
            id: 'ov-0001',
            responder: 'elena.maint',
            reason: 'Holiday coverage swap',
            startIso: '2026-12-24T00:00:00.000Z',
            endIso: '2026-12-26T23:59:59.000Z',
          },
        ],
        updatedAt: now,
      },
    ],
  };
}

const globalForEscalations = globalThis as unknown as {
  __escalationPoliciesStore?: EscalationStore;
};

function getEscalationStore(): EscalationStore {
  if (!globalForEscalations.__escalationPoliciesStore) {
    globalForEscalations.__escalationPoliciesStore = createSeededEscalationStore();
  }
  return globalForEscalations.__escalationPoliciesStore;
}

export async function GET(req: NextRequest) {
  const store = getEscalationStore();
  const workspace = req.nextUrl.searchParams.get('workspace')?.trim() || '';

  const policies = store.policies.filter(
    (p) => !workspace || workspace === 'all' || p.workspace === workspace || p.workspace === 'global',
  );
  const incidents = store.incidents.filter(
    (inc) => !workspace || workspace === 'all' || inc.workspace === workspace || inc.workspace === 'global',
  );
  const schedules = store.schedules.filter(
    (s) => !workspace || workspace === 'all' || s.workspace === workspace || s.workspace === 'global',
  );

  return NextResponse.json({
    policies,
    incidents,
    schedules,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const store = getEscalationStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Branch 1: Add temporary on-call schedule override
  if (body.kind === 'schedule-override') {
    const schedule = store.schedules.find((s) => s.id === body.scheduleId) ?? store.schedules[0];
    if (!schedule) {
      return NextResponse.json({ error: 'Routing schedule not found.' }, { status: 404 });
    }
    const responder = typeof body.responder === 'string' ? body.responder.trim() : '';
    if (!responder) {
      return NextResponse.json({ error: '`responder` is required for schedule override.' }, { status: 400 });
    }
    store.seq += 1;
    const override: ScheduleOverride = {
      id: `ov-${String(store.seq).padStart(4, '0')}`,
      responder,
      reason:
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim()
          : 'Manual on-call override',
      startIso:
        typeof body.startIso === 'string' ? body.startIso : new Date().toISOString(),
      endIso:
        typeof body.endIso === 'string'
          ? body.endIso
          : new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
    schedule.overrides.unshift(override);
    schedule.updatedAt = new Date().toISOString();
    return NextResponse.json({ schedule, override }, { status: 201 });
  }

  // Branch 2: Create a new escalation policy
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Escalation policy `name` is required.' }, { status: 400 });
  }

  const tiers: EscalationTier[] =
    Array.isArray(body.tiers) && body.tiers.length > 0
      ? (body.tiers as EscalationTier[])
      : [
          {
            level: 1,
            timeoutMinutes: 10,
            targets: ['oncall:primary'],
            channels: ['slack', 'in_app'],
          },
        ];

  store.seq += 1;
  const now = new Date().toISOString();
  const policy: EscalationPolicy = {
    id: `esc-${String(store.seq).padStart(4, '0')}`,
    workspace: typeof body.workspace === 'string' ? body.workspace : 'global',
    name,
    description:
      typeof body.description === 'string' ? body.description.trim() : '',
    tiers,
    fallbackRecipients:
      Array.isArray(body.fallbackRecipients) && body.fallbackRecipients.length > 0
        ? (body.fallbackRecipients as string[])
        : ['noc-fallback@crashlab.internal'],
    repeatCount:
      typeof body.repeatCount === 'number'
        ? Math.max(0, Math.min(10, body.repeatCount))
        : 1,
    autoResolveMinutes:
      typeof body.autoResolveMinutes === 'number'
        ? Math.max(15, body.autoResolveMinutes)
        : 120,
    version: 1,
    updatedBy:
      typeof body.actor === 'string' && body.actor.trim()
        ? body.actor.trim()
        : 'maintainer',
    updatedAt: now,
  };

  store.policies.unshift(policy);
  return NextResponse.json({ policy }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const store = getEscalationStore();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Branch 1: Incident acknowledgment / escalation / resolution transition
  if (body.kind === 'incident-transition') {
    const incident = store.incidents.find((inc) => inc.id === body.id);
    if (!incident) {
      return NextResponse.json({ error: 'Escalation incident not found.' }, { status: 404 });
    }
    const nextState = body.state as IncidentAckState;
    const actor =
      typeof body.actor === 'string' && body.actor.trim()
        ? body.actor.trim()
        : 'responder';
    const now = new Date().toISOString();

    if (nextState === 'acknowledged') {
      incident.state = 'acknowledged';
      incident.acknowledgedBy = actor;
      incident.acknowledgedAt = now;
    } else if (nextState === 'escalated') {
      incident.state = 'escalated';
      incident.currentTierLevel += 1;
    } else if (nextState === 'resolved') {
      incident.state = 'resolved';
      incident.resolvedBy = actor;
      incident.resolvedAt = now;
    } else {
      return NextResponse.json({ error: 'Invalid incident transition state.' }, { status: 400 });
    }

    return NextResponse.json({ incident });
  }

  // Branch 2: Update quiet hours configuration on a routing schedule
  if (body.kind === 'quiet-hours') {
    const schedule =
      store.schedules.find((s) => s.id === body.scheduleId) ?? store.schedules[0];
    if (!schedule) {
      return NextResponse.json({ error: 'Routing schedule not found.' }, { status: 404 });
    }
    if (typeof body.enabled === 'boolean') {
      schedule.quietHours.enabled = body.enabled;
    }
    if (typeof body.startHourUtc === 'number') {
      schedule.quietHours.startHourUtc = Math.max(0, Math.min(23, body.startHourUtc));
    }
    if (typeof body.endHourUtc === 'number') {
      schedule.quietHours.endHourUtc = Math.max(0, Math.min(23, body.endHourUtc));
    }
    if (typeof body.allowCriticalBypass === 'boolean') {
      schedule.quietHours.allowCriticalBypass = body.allowCriticalBypass;
    }
    schedule.updatedAt = new Date().toISOString();
    return NextResponse.json({ schedule });
  }

  // Branch 3: Update escalation policy tiers or fallback recipients
  const policy = store.policies.find((p) => p.id === body.id);
  if (!policy) {
    return NextResponse.json({ error: 'Escalation policy not found.' }, { status: 404 });
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    policy.name = body.name.trim();
  }
  if (Array.isArray(body.tiers) && body.tiers.length > 0) {
    policy.tiers = body.tiers as EscalationTier[];
  }
  if (Array.isArray(body.fallbackRecipients)) {
    policy.fallbackRecipients = body.fallbackRecipients as string[];
  }
  if (typeof body.repeatCount === 'number') {
    policy.repeatCount = Math.max(0, Math.min(10, body.repeatCount));
  }
  policy.version += 1;
  policy.updatedAt = new Date().toISOString();

  return NextResponse.json({ policy });
}
