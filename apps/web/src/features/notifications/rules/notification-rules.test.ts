import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  computeRuleVersionDiff,
  evaluateRulePredicate,
  GET as getRules,
  normalizeThrottlingConfig,
  PATCH as patchRule,
  POST as postRule,
  renderTemplatedPayload,
  SAFE_DEFAULT_THROTTLING,
  simulateRulesAgainstEvent,
  type NotificationRule,
  type SampleSimulationEvent,
} from '@/app/api/notification-rules/route';
import {
  GET as getEscalations,
  isQuietHoursActive,
  PATCH as patchEscalation,
  POST as postEscalation,
  resolveActiveOnCallResponder,
  type RoutingSchedule,
} from '@/app/api/escalation-policies/route';

describe('Notification Rules & Escalation Policy Builder (#2316)', () => {
  describe('Rule Predicates, Templated Payloads & Safe Anti-Storm Throttling', () => {
    it('evaluates all predicate operators deterministically', () => {
      const attrs = {
        contract: 'token.swap',
        crash_count: 5,
        status: 'failed',
      };
      expect(
        evaluateRulePredicate({ field: 'contract', operator: 'eq', value: 'token.swap' }, attrs),
      ).toBe(true);
      expect(
        evaluateRulePredicate({ field: 'contract', operator: 'neq', value: 'vault' }, attrs),
      ).toBe(true);
      expect(
        evaluateRulePredicate({ field: 'crash_count', operator: 'gte', value: 3 }, attrs),
      ).toBe(true);
      expect(
        evaluateRulePredicate({ field: 'crash_count', operator: 'lte', value: 2 }, attrs),
      ).toBe(false);
      expect(
        evaluateRulePredicate({ field: 'contract', operator: 'contains', value: 'SWAP' }, attrs),
      ).toBe(true);
      expect(
        evaluateRulePredicate(
          { field: 'status', operator: 'in', value: ['pending', 'failed'] },
          attrs,
        ),
      ).toBe(true);
    });

    it('clamps throttling config to safe anti-storm boundaries', () => {
      expect(normalizeThrottlingConfig(undefined)).toEqual(SAFE_DEFAULT_THROTTLING);
      const clamped = normalizeThrottlingConfig({
        dedupWindowSeconds: 5,
        maxDeliveriesPerHour: 9999,
        cooldownSeconds: 1,
        groupingKeys: ['contract'],
      });
      expect(clamped.dedupWindowSeconds).toBe(30);
      expect(clamped.maxDeliveriesPerHour).toBe(200);
      expect(clamped.cooldownSeconds).toBe(15);
      expect(clamped.groupingKeys).toEqual(['contract']);
    });

    it('renders templated notification payloads and computes version diffs', () => {
      const rule: NotificationRule = {
        id: 'rule-test',
        workspace: 'global',
        name: 'Vault Alert',
        description: 'Test rule',
        eventSource: 'crashes',
        minSeverity: 'high',
        predicates: [],
        actions: [],
        throttling: { ...SAFE_DEFAULT_THROTTLING },
        enabled: true,
        rolloutStage: 'active',
        version: 1,
        approvalStatus: 'approved',
        updatedBy: 'ops',
        updatedAt: '2026-11-22T00:00:00.000Z',
      };
      const event: SampleSimulationEvent = {
        id: 'ev-1',
        workspace: 'global',
        eventSource: 'crashes',
        severity: 'critical',
        timestampIso: '2026-11-22T01:00:00.000Z',
        fingerprint: 'sig-123',
        attributes: { contract: 'vault.deposit' },
      };

      const rendered = renderTemplatedPayload(
        '[{{severity}}] {{rule}} on {{contract}} ({{fingerprint}})',
        event,
        rule,
      );
      expect(rendered).toBe('[critical] Vault Alert on vault.deposit (sig-123)');

      const nextRule: NotificationRule = {
        ...rule,
        minSeverity: 'critical',
        rolloutStage: 'canary_25',
      };
      expect(computeRuleVersionDiff(rule, nextRule)).toContain('minSeverity: high -> critical');
      expect(computeRuleVersionDiff(rule, nextRule)).toContain(
        'rolloutStage: active -> canary_25',
      );
    });
  });

  describe('Deterministic Rule Simulation & Suppression Semantics', () => {
    it('identifies matched recipients and reports dedup, rate-limit, maintenance, and quiet-hours suppressions', () => {
      const sampleRule: NotificationRule = {
        id: 'r-1',
        workspace: 'global',
        name: 'Crash Rule',
        description: '',
        eventSource: 'crashes',
        minSeverity: 'medium',
        predicates: [{ field: 'contract', operator: 'eq', value: 'token.swap' }],
        actions: [
          {
            channel: 'slack',
            recipient: '#alerts',
            template: 'Alert {{fingerprint}} on {{contract}}',
          },
        ],
        throttling: {
          dedupWindowSeconds: 300,
          groupingKeys: ['contract'],
          maxDeliveriesPerHour: 10,
          cooldownSeconds: 60,
        },
        enabled: true,
        rolloutStage: 'active',
        version: 1,
        approvalStatus: 'approved',
        updatedBy: 'ops',
        updatedAt: '2026-11-22T00:00:00.000Z',
      };

      const cleanEvent: SampleSimulationEvent = {
        id: 'ev-clean',
        workspace: 'global',
        eventSource: 'crashes',
        severity: 'high',
        timestampIso: '2026-11-22T03:00:00.000Z',
        fingerprint: 'fp-1',
        attributes: { contract: 'token.swap' },
        recentCountInHour: 2,
        duplicateWithinWindow: false,
      };

      const activePreview = simulateRulesAgainstEvent([sampleRule], cleanEvent);
      expect(activePreview[0]?.matched).toBe(true);
      expect(activePreview[0]?.suppressed).toBe(false);
      expect(activePreview[0]?.matchedActions[0]?.renderedPayload).toBe(
        'Alert fp-1 on token.swap',
      );

      // Now test suppression by dedup, rate limit, quiet hours, and maintenance window
      const suppressedPreview = simulateRulesAgainstEvent(
        [sampleRule],
        {
          ...cleanEvent,
          recentCountInHour: 15,
          duplicateWithinWindow: true,
        },
        [
          {
            id: 'mw-1',
            label: 'Upgrade Window',
            workspace: 'global',
            startIso: '2026-11-22T02:00:00.000Z',
            endIso: '2026-11-22T04:00:00.000Z',
            suppressSources: ['crashes'],
            active: true,
          },
        ],
        { quietHoursActive: true },
      );

      expect(suppressedPreview[0]?.matched).toBe(true);
      expect(suppressedPreview[0]?.suppressed).toBe(true);
      expect(suppressedPreview[0]?.suppressionReasons).toHaveLength(4);
    });
  });

  describe('Schedules, Quiet Hours & On-Call Override Resolution', () => {
    it('resolves temporary schedule overrides over baseline rotation and evaluates UTC quiet hours', () => {
      const schedule: RoutingSchedule = {
        id: 'sched-1',
        workspace: 'global',
        name: 'Primary Rotation',
        timezone: 'UTC',
        currentOnCall: 'alice.oncall',
        backupOnCall: 'bob.backup',
        rotations: [],
        quietHours: {
          enabled: true,
          startHourUtc: 22,
          endHourUtc: 6,
          allowCriticalBypass: true,
        },
        overrides: [
          {
            id: 'ov-1',
            responder: 'elena.override',
            reason: 'PTO coverage',
            startIso: '2026-11-22T00:00:00.000Z',
            endIso: '2026-11-22T12:00:00.000Z',
          },
        ],
        updatedAt: '2026-11-22T00:00:00.000Z',
      };

      expect(
        resolveActiveOnCallResponder(schedule, '2026-11-22T06:00:00.000Z'),
      ).toEqual({
        responder: 'elena.override',
        source: 'override',
      });

      expect(
        resolveActiveOnCallResponder(schedule, '2026-11-23T06:00:00.000Z'),
      ).toEqual({
        responder: 'alice.oncall',
        source: 'rotation',
      });

      expect(isQuietHoursActive(schedule.quietHours, 23)).toBe(true);
      expect(isQuietHoursActive(schedule.quietHours, 3)).toBe(true);
      expect(isQuietHoursActive(schedule.quietHours, 14)).toBe(false);
    });
  });

  describe('API Routes: /api/notification-rules & /api/escalation-policies (RBAC & Governance)', () => {
    it('enforces maintainer RBAC for sensitive targets and policy approvals', async () => {
      // Analyst attempting to create a PagerDuty rule is rejected with 403
      const analystDeniedReq = new NextRequest(
        'http://localhost:3000/api/notification-rules',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Analyst PagerDuty Attempt',
            actorRole: 'analyst',
            actions: [
              {
                channel: 'pagerduty',
                recipient: 'pd-sec',
                template: 'Alert',
              },
            ],
          }),
        },
      );
      const deniedRes = await postRule(analystDeniedReq);
      expect(deniedRes.status).toBe(403);

      // Analyst creating a standard Slack rule succeeds with pending_approval status
      const analystSlackReq = new NextRequest(
        'http://localhost:3000/api/notification-rules',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Analyst Slack Triage Rule',
            actorRole: 'analyst',
            actor: 'analyst-jane',
            actions: [
              {
                channel: 'slack',
                recipient: '#triage',
                template: 'Triage {{fingerprint}}',
              },
            ],
          }),
        },
      );
      const createdRes = await postRule(analystSlackReq);
      expect(createdRes.status).toBe(201);
      const createdData = (await createdRes.json()) as { rule: NotificationRule };
      expect(createdData.rule.approvalStatus).toBe('pending_approval');

      // Analyst attempting to self-approve is rejected with 403
      const selfApproveReq = new NextRequest(
        'http://localhost:3000/api/notification-rules',
        {
          method: 'PATCH',
          body: JSON.stringify({
            id: createdData.rule.id,
            actorRole: 'analyst',
            approvalStatus: 'approved',
          }),
        },
      );
      const selfApproveRes = await patchRule(selfApproveReq);
      expect(selfApproveRes.status).toBe(403);

      // Maintainer approving the rule succeeds and increments version
      const maintApproveReq = new NextRequest(
        'http://localhost:3000/api/notification-rules',
        {
          method: 'PATCH',
          body: JSON.stringify({
            id: createdData.rule.id,
            actorRole: 'maintainer',
            actor: 'maint-lead',
            approvalStatus: 'approved',
            rolloutStage: 'active',
          }),
        },
      );
      const maintApproveRes = await patchRule(maintApproveReq);
      expect(maintApproveRes.status).toBe(200);
      const approvedData = (await maintApproveRes.json()) as {
        rule: NotificationRule;
        diffSummary: string;
      };
      expect(approvedData.rule.approvalStatus).toBe('approved');
      expect(approvedData.rule.version).toBe(2);
      expect(approvedData.diffSummary).toContain('approvalStatus');

      const listRes = await getRules(
        new NextRequest('http://localhost:3000/api/notification-rules?q=Analyst'),
      );
      expect(listRes.status).toBe(200);
    });

    it('manages escalation policies, incident acknowledgment transitions, and schedule overrides', async () => {
      const getRes = await getEscalations(
        new NextRequest('http://localhost:3000/api/escalation-policies'),
      );
      expect(getRes.status).toBe(200);
      const initial = (await getRes.json()) as {
        incidents: Array<{ id: string; state: string }>;
        schedules: Array<{ id: string }>;
      };
      const firstIncidentId = initial.incidents[0]!.id;
      const firstScheduleId = initial.schedules[0]!.id;

      // Transition incident to acknowledged
      const ackRes = await patchEscalation(
        new NextRequest('http://localhost:3000/api/escalation-policies', {
          method: 'PATCH',
          body: JSON.stringify({
            kind: 'incident-transition',
            id: firstIncidentId,
            state: 'acknowledged',
            actor: 'alice.oncall',
          }),
        }),
      );
      expect(ackRes.status).toBe(200);
      const ackData = (await ackRes.json()) as {
        incident: { state: string; acknowledgedBy: string };
      };
      expect(ackData.incident.state).toBe('acknowledged');
      expect(ackData.incident.acknowledgedBy).toBe('alice.oncall');

      // Add a temporary schedule override
      const ovRes = await postEscalation(
        new NextRequest('http://localhost:3000/api/escalation-policies', {
          method: 'POST',
          body: JSON.stringify({
            kind: 'schedule-override',
            scheduleId: firstScheduleId,
            responder: 'temp.oncall',
            reason: 'Incident handoff',
          }),
        }),
      );
      expect(ovRes.status).toBe(201);
    });
  });
});
