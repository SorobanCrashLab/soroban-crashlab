'use client';

/**
 * hooks/useNotificationPolicies — orchestrates workspace-scoped notification
 * rules, escalation policies, on-call routing schedules, maintenance windows,
 * deterministic simulation, and RBAC-gated governance (#2316).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MaintenanceWindow,
  NotificationActionTarget,
  NotificationEventSource,
  NotificationRule,
  NotificationSeverity,
  PolicyAuditLogEntry,
  RolloutStage,
  RulePredicate,
  RuleSimulationDeliveryPreview,
  SampleSimulationEvent,
  ThrottlingConfig,
} from '@/app/api/notification-rules/route';
import type {
  ActiveEscalationIncident,
  EscalationPolicy,
  EscalationTier,
  IncidentAckState,
  RoutingSchedule,
} from '@/app/api/escalation-policies/route';

export interface CreateRuleDraft {
  name: string;
  description: string;
  eventSource: NotificationEventSource;
  minSeverity: NotificationSeverity;
  predicates: RulePredicate[];
  actions: NotificationActionTarget[];
  throttling: ThrottlingConfig;
  escalationPolicyId: string;
  scheduleId: string;
  rolloutStage: RolloutStage;
}

export interface UseNotificationPoliciesState {
  workspace: string;
  actorRole: 'analyst' | 'maintainer';
  searchQuery: string;
  sourceFilter: NotificationEventSource | 'all';
  rules: NotificationRule[];
  maintenanceWindows: MaintenanceWindow[];
  auditHistory: PolicyAuditLogEntry[];
  escalationPolicies: EscalationPolicy[];
  incidents: ActiveEscalationIncident[];
  schedules: RoutingSchedule[];
  simulationPreviews: RuleSimulationDeliveryPreview[];
  isLoading: boolean;
  statusBanner: string;
  errorBanner: string | null;
  setWorkspace: (ws: string) => void;
  setActorRole: (role: 'analyst' | 'maintainer') => void;
  setSearchQuery: (q: string) => void;
  setSourceFilter: (src: NotificationEventSource | 'all') => void;
  refresh: () => Promise<void>;
  createRule: (draft: CreateRuleDraft) => Promise<boolean>;
  updateRule: (
    id: string,
    patch: Partial<
      Pick<
        NotificationRule,
        'name' | 'enabled' | 'rolloutStage' | 'approvalStatus' | 'minSeverity' | 'throttling'
      >
    >,
  ) => Promise<boolean>;
  toggleMaintenanceWindow: (id: string, active: boolean) => Promise<void>;
  runSimulation: (
    event: SampleSimulationEvent,
    quietHoursActive?: boolean,
  ) => Promise<void>;
  createEscalationPolicy: (input: {
    name: string;
    description: string;
    tiers: EscalationTier[];
    fallbackRecipients: string[];
  }) => Promise<boolean>;
  transitionIncident: (id: string, state: IncidentAckState) => Promise<void>;
  addScheduleOverride: (input: {
    scheduleId: string;
    responder: string;
    reason: string;
  }) => Promise<void>;
  updateQuietHours: (input: {
    scheduleId: string;
    enabled: boolean;
    startHourUtc: number;
    endHourUtc: number;
    allowCriticalBypass: boolean;
  }) => Promise<void>;
}

export function useNotificationPolicies(): UseNotificationPoliciesState {
  const [workspace, setWorkspace] = useState<string>('global');
  const [actorRole, setActorRole] = useState<'analyst' | 'maintainer'>('maintainer');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<NotificationEventSource | 'all'>('all');

  const [allRules, setAllRules] = useState<NotificationRule[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [auditHistory, setAuditHistory] = useState<PolicyAuditLogEntry[]>([]);
  const [escalationPolicies, setEscalationPolicies] = useState<EscalationPolicy[]>([]);
  const [incidents, setIncidents] = useState<ActiveEscalationIncident[]>([]);
  const [schedules, setSchedules] = useState<RoutingSchedule[]>([]);
  const [simulationPreviews, setSimulationPreviews] = useState<
    RuleSimulationDeliveryPreview[]
  >([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof fetch !== 'function') return;
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const [rulesRes, escRes] = await Promise.all([
        fetch(`/api/notification-rules?workspace=${encodeURIComponent(workspace)}`),
        fetch(`/api/escalation-policies?workspace=${encodeURIComponent(workspace)}`),
      ]);
      if (rulesRes.ok) {
        const rulesData = (await rulesRes.json()) as {
          rules: NotificationRule[];
          maintenanceWindows: MaintenanceWindow[];
          auditHistory: PolicyAuditLogEntry[];
        };
        setAllRules(rulesData.rules ?? []);
        setMaintenanceWindows(rulesData.maintenanceWindows ?? []);
        setAuditHistory(rulesData.auditHistory ?? []);
      }
      if (escRes.ok) {
        const escData = (await escRes.json()) as {
          policies: EscalationPolicy[];
          incidents: ActiveEscalationIncident[];
          schedules: RoutingSchedule[];
        };
        setEscalationPolicies(escData.policies ?? []);
        setIncidents(escData.incidents ?? []);
        setSchedules(escData.schedules ?? []);
      }
    } catch {
      setErrorBanner('Failed to load notification rules and escalation policies.');
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch notification policies when workspace changes
    void refresh();
  }, [refresh]);

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRules.filter((rule) => {
      if (sourceFilter !== 'all' && rule.eventSource !== sourceFilter) return false;
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
  }, [allRules, searchQuery, sourceFilter]);

  const createRule = useCallback(
    async (draft: CreateRuleDraft): Promise<boolean> => {
      setErrorBanner(null);
      try {
        const res = await fetch('/api/notification-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...draft,
            workspace,
            actorRole,
            actor: `${actorRole}-operator`,
          }),
        });
        const data = (await res.json()) as { rule?: NotificationRule; error?: string };
        if (!res.ok) {
          setErrorBanner(data.error ?? 'Could not create notification rule.');
          return false;
        }
        setStatusBanner(`Created rule "${data.rule?.name}" (v1).`);
        await refresh();
        return true;
      } catch {
        setErrorBanner('Network error while creating notification rule.');
        return false;
      }
    },
    [actorRole, refresh, workspace],
  );

  const updateRule = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          NotificationRule,
          'name' | 'enabled' | 'rolloutStage' | 'approvalStatus' | 'minSeverity' | 'throttling'
        >
      >,
    ): Promise<boolean> => {
      setErrorBanner(null);
      try {
        const res = await fetch('/api/notification-rules', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id,
            ...patch,
            actorRole,
            actor: `${actorRole}-operator`,
          }),
        });
        const data = (await res.json()) as {
          rule?: NotificationRule;
          diffSummary?: string;
          error?: string;
        };
        if (!res.ok) {
          setErrorBanner(data.error ?? 'Rule update denied.');
          return false;
        }
        setStatusBanner(
          `Updated ${id} to v${data.rule?.version}: ${data.diffSummary ?? 'saved'}`,
        );
        await refresh();
        return true;
      } catch {
        setErrorBanner('Network error while updating rule.');
        return false;
      }
    },
    [actorRole, refresh],
  );

  const toggleMaintenanceWindow = useCallback(
    async (id: string, active: boolean) => {
      try {
        await fetch('/api/notification-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'maintenance-window', id, active }),
        });
        setStatusBanner(
          `Maintenance window ${id} ${active ? 'activated' : 'deactivated'}.`,
        );
        await refresh();
      } catch {
        setErrorBanner('Failed to toggle maintenance window.');
      }
    },
    [refresh],
  );

  const runSimulation = useCallback(
    async (event: SampleSimulationEvent, quietHoursActive = false) => {
      try {
        const res = await fetch('/api/notification-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'simulate',
            event,
            quietHoursActive,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            previews: RuleSimulationDeliveryPreview[];
            matchedCount: number;
            suppressedCount: number;
          };
          setSimulationPreviews(data.previews ?? []);
          setStatusBanner(
            `Simulation complete: ${data.matchedCount} active deliveries, ${data.suppressedCount} suppressed.`,
          );
        }
      } catch {
        setErrorBanner('Simulation execution failed.');
      }
    },
    [],
  );

  const createEscalationPolicy = useCallback(
    async (input: {
      name: string;
      description: string;
      tiers: EscalationTier[];
      fallbackRecipients: string[];
    }): Promise<boolean> => {
      try {
        const res = await fetch('/api/escalation-policies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...input,
            workspace,
            actor: `${actorRole}-operator`,
          }),
        });
        if (!res.ok) return false;
        setStatusBanner(`Created escalation policy "${input.name}".`);
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [actorRole, refresh, workspace],
  );

  const transitionIncident = useCallback(
    async (id: string, state: IncidentAckState) => {
      try {
        const res = await fetch('/api/escalation-policies', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'incident-transition',
            id,
            state,
            actor: `${actorRole}-responder`,
          }),
        });
        if (res.ok) {
          setStatusBanner(`Incident ${id} transitioned to ${state}.`);
          await refresh();
        }
      } catch {
        setErrorBanner('Could not transition escalation incident.');
      }
    },
    [actorRole, refresh],
  );

  const addScheduleOverride = useCallback(
    async (input: { scheduleId: string; responder: string; reason: string }) => {
      try {
        const res = await fetch('/api/escalation-policies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'schedule-override',
            ...input,
          }),
        });
        if (res.ok) {
          setStatusBanner(`Added on-call override for ${input.responder}.`);
          await refresh();
        }
      } catch {
        setErrorBanner('Could not add schedule override.');
      }
    },
    [refresh],
  );

  const updateQuietHours = useCallback(
    async (input: {
      scheduleId: string;
      enabled: boolean;
      startHourUtc: number;
      endHourUtc: number;
      allowCriticalBypass: boolean;
    }) => {
      try {
        const res = await fetch('/api/escalation-policies', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'quiet-hours',
            ...input,
          }),
        });
        if (res.ok) {
          setStatusBanner('Updated schedule quiet-hours routing policy.');
          await refresh();
        }
      } catch {
        setErrorBanner('Could not update quiet hours.');
      }
    },
    [refresh],
  );

  return {
    workspace,
    actorRole,
    searchQuery,
    sourceFilter,
    rules: filteredRules,
    maintenanceWindows,
    auditHistory,
    escalationPolicies,
    incidents,
    schedules,
    simulationPreviews,
    isLoading,
    statusBanner,
    errorBanner,
    setWorkspace,
    setActorRole,
    setSearchQuery,
    setSourceFilter,
    refresh,
    createRule,
    updateRule,
    toggleMaintenanceWindow,
    runSimulation,
    createEscalationPolicy,
    transitionIncident,
    addScheduleOverride,
    updateQuietHours,
  };
}
