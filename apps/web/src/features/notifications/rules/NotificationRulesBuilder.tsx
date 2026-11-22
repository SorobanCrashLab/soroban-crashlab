'use client';

/**
 * NotificationRulesBuilder — unified multi-channel notification rule & escalation
 * policy orchestration center (#2316).
 *
 * Includes:
 * - Workspace scoping & RBAC role selector (`analyst` vs `maintainer`)
 * - Rule builder for event sources (`crashes`, `regressions`, `ci_gates`,
 *   `incidents`, `data_quality`), predicates, templated multi-channel targets,
 *   and anti-storm deduplication/throttling/cooldown controls
 * - Escalation Policy Editor & live incident acknowledgment tracker
 * - On-call Routing Schedules, quiet hours, overrides & maintenance windows
 * - Deterministic Rule Simulator with delivery & suppression previews
 * - Governance panel: versioning, approvals, staged rollouts, and audit trail
 */

import React, { useRef, useState, type KeyboardEvent } from 'react';
import {
  SAFE_DEFAULT_THROTTLING,
  type NotificationChannelType,
  type NotificationEventSource,
  type NotificationSeverity,
  type PredicateOperator,
  type RolloutStage,
} from '@/app/api/notification-rules/route';
import { EscalationPolicyEditor } from './EscalationPolicyEditor';
import { RoutingSchedules } from './RoutingSchedules';
import { RuleSimulator } from './RuleSimulator';
import { useNotificationPolicies } from './hooks/useNotificationPolicies';

const TABS = [
  { id: 'rules', label: 'Routing Rules & Throttling' },
  { id: 'escalations', label: 'Escalation Policies & Ack' },
  { id: 'schedules', label: 'Schedules & Maintenance' },
  { id: 'simulator', label: 'Simulator & Delivery Preview' },
  { id: 'governance', label: 'Governance & Audit Trail' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function NotificationRulesBuilder() {
  const state = useNotificationPolicies();
  const [activeTab, setActiveTab] = useState<TabId>('rules');
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    rules: null,
    escalations: null,
    schedules: null,
    simulator: null,
    governance: null,
  });

  // Rule creation form state (with safe anti-storm defaults)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventSource, setEventSource] = useState<NotificationEventSource>('crashes');
  const [minSeverity, setMinSeverity] = useState<NotificationSeverity>('high');
  const [predicateField, setPredicateField] = useState('is_new_signature');
  const [predicateOp, setPredicateOp] = useState<PredicateOperator>('eq');
  const [predicateValue, setPredicateValue] = useState('true');
  const [channel, setChannel] = useState<NotificationChannelType>('slack');
  const [recipient, setRecipient] = useState('#soroban-alerts');
  const [template, setTemplate] = useState(
    '🚨 [{{severity}}] {{rule}} triggered on {{contract}} ({{fingerprint}})',
  );
  const [dedupWindowSeconds, setDedupWindowSeconds] = useState(
    SAFE_DEFAULT_THROTTLING.dedupWindowSeconds,
  );
  const [maxDeliveriesPerHour, setMaxDeliveriesPerHour] = useState(
    SAFE_DEFAULT_THROTTLING.maxDeliveriesPerHour,
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(
    SAFE_DEFAULT_THROTTLING.cooldownSeconds,
  );
  const [groupingKeysInput, setGroupingKeysInput] = useState('contract, signature');
  const [rolloutStage, setRolloutStage] = useState<RolloutStage>('canary_25');

  const activateTab = (id: TabId, focus = false) => {
    setActiveTab(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      activateTab(TABS[next].id, true);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await state.createRule({
      name: name.trim(),
      description: description.trim(),
      eventSource,
      minSeverity,
      predicates: predicateField.trim()
        ? [
            {
              field: predicateField.trim(),
              operator: predicateOp,
              value: predicateValue.trim(),
            },
          ]
        : [],
      actions: [
        {
          channel,
          recipient: recipient.trim() || '#alerts',
          template: template.trim() || '[{{severity}}] {{rule}}',
          sensitiveTarget: channel === 'pagerduty' || channel === 'webhook',
        },
      ],
      throttling: {
        dedupWindowSeconds,
        maxDeliveriesPerHour,
        cooldownSeconds,
        groupingKeys: groupingKeysInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      escalationPolicyId: state.escalationPolicies[0]?.id ?? 'esc-0001',
      scheduleId: state.schedules[0]?.id ?? 'sched-0001',
      rolloutStage,
    });
    if (ok) {
      setName('');
      setDescription('');
    }
  };

  return (
    <div className="space-y-6" data-testid="notification-rules-builder">
      {/* Live status & error banners */}
      <div role="status" aria-live="polite" className="sr-only">
        {state.statusBanner}
      </div>

      {state.statusBanner && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-bg)] px-4 py-2.5 text-xs">
          {state.statusBanner}
        </div>
      )}

      {state.errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-red-400 bg-red-50/80 dark:bg-red-950/30 px-4 py-3 text-xs text-red-800 dark:text-red-200"
        >
          {state.errorBanner}
        </div>
      )}

      {/* Workspace Scope & RBAC Toolbar */}
      <section aria-label="Workspace and role context" className="card card-padding">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium flex items-center gap-2">
              <span>Workspace scope:</span>
              <select
                aria-label="Select notification workspace"
                value={state.workspace}
                onChange={(e) => state.setWorkspace(e.target.value)}
                className="form-input text-xs py-1.5"
              >
                <option value="global">Global (All Workspaces)</option>
                <option value="triage-ops">Workspace: triage-ops</option>
                <option value="contract-audit">Workspace: contract-audit</option>
                <option value="release-ops">Workspace: release-ops</option>
              </select>
            </label>

            <label className="text-xs font-medium flex items-center gap-2">
              <span>RBAC evaluation role:</span>
              <select
                aria-label="Select RBAC role"
                value={state.actorRole}
                onChange={(e) =>
                  state.setActorRole(e.target.value as 'analyst' | 'maintainer')
                }
                className="form-input text-xs py-1.5"
              >
                <option value="maintainer">Maintainer (Approve &amp; Sensitive Targets)</option>
                <option value="analyst">Analyst (Draft Rules &amp; Standard Channels)</option>
              </select>
            </label>
          </div>

          <div className="text-xs text-meta">
            Active rules: <strong>{state.rules.filter((r) => r.enabled).length}</strong> /{' '}
            {state.rules.length} · Escalation policies:{' '}
            <strong>{state.escalationPolicies.length}</strong>
          </div>
        </div>
      </section>

      {/* WAI-ARIA Tablist */}
      <div
        role="tablist"
        aria-label="Notification rules and escalation policy views"
        className="flex flex-wrap gap-2"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`notif-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`notif-panel-${t.id}`}
            tabIndex={activeTab === t.id ? 0 : -1}
            onClick={() => activateTab(t.id)}
            onKeyDown={handleTabKeyDown}
            className={`chip text-xs ${activeTab === t.id ? 'chip-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Routing Rules & Throttling */}
      <div
        role="tabpanel"
        id="notif-panel-rules"
        aria-labelledby="notif-tab-rules"
        hidden={activeTab !== 'rules'}
      >
        {activeTab === 'rules' && (
          <div className="space-y-6">
            {/* Search & Source Filter Bar */}
            <section className="card card-padding">
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex-1 text-xs">
                  <span className="sr-only">Search notification rules</span>
                  <input
                    type="search"
                    value={state.searchQuery}
                    onChange={(e) => state.setSearchQuery(e.target.value)}
                    placeholder="Filter rules by name, ID, or description..."
                    className="form-input w-full"
                  />
                </label>

                <label className="text-xs">
                  <span className="sr-only">Filter by event source</span>
                  <select
                    value={state.sourceFilter}
                    onChange={(e) =>
                      state.setSourceFilter(
                        e.target.value as NotificationEventSource | 'all',
                      )
                    }
                    className="form-input w-full sm:w-48"
                  >
                    <option value="all">All event sources</option>
                    <option value="crashes">crashes</option>
                    <option value="regressions">regressions</option>
                    <option value="ci_gates">ci_gates</option>
                    <option value="incidents">incidents</option>
                    <option value="data_quality">data_quality</option>
                  </select>
                </label>
              </div>
            </section>

            {/* Rule Catalog List */}
            <section aria-labelledby="rules-catalog-heading" className="card card-padding space-y-4">
              <h2 id="rules-catalog-heading" className="heading-section">
                Configured routing rules ({state.rules.length})
              </h2>

              <div className="space-y-3">
                {state.rules.map((rule) => (
                  <article
                    key={rule.id}
                    className="rounded-xl border border-[var(--border-color)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-meta">
                          <span>{rule.id}</span>
                          <span>· v{rule.version}</span>
                          <span>· source: {rule.eventSource}</span>
                          <span>· min: {rule.minSeverity}</span>
                          <span>· rollout: {rule.rolloutStage}</span>
                          <span>· status: {rule.approvalStatus}</span>
                        </div>
                        <h3 className="text-sm font-semibold mt-1">{rule.name}</h3>
                        <p className="text-xs text-meta mt-0.5">{rule.description}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Staged rollout for ${rule.name}`}
                          value={rule.rolloutStage}
                          onChange={(e) =>
                            void state.updateRule(rule.id, {
                              rolloutStage: e.target.value as RolloutStage,
                            })
                          }
                          className="form-input text-xs py-1"
                        >
                          <option value="disabled">disabled</option>
                          <option value="dry_run">dry_run (log only)</option>
                          <option value="canary_25">canary_25 (25%)</option>
                          <option value="active">active (100%)</option>
                        </select>

                        <button
                          type="button"
                          aria-pressed={rule.enabled}
                          onClick={() =>
                            void state.updateRule(rule.id, { enabled: !rule.enabled })
                          }
                          className="btn-outline text-xs px-3 py-1"
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2 border-t border-[var(--border-color)]">
                      <div>
                        <strong>Predicates:</strong>{' '}
                        <span className="font-mono">
                          {rule.predicates.length === 0
                            ? 'all events'
                            : rule.predicates
                                .map((p) => `${p.field} ${p.operator} ${String(p.value)}`)
                                .join(' AND ')}
                        </span>
                      </div>
                      <div>
                        <strong>Channels:</strong>{' '}
                        <span className="font-mono">
                          {rule.actions
                            .map((a) => `${a.channel}→${a.recipient}`)
                            .join(', ')}
                        </span>
                      </div>
                      <div>
                        <strong>Anti-Storm Limits:</strong>{' '}
                        <span className="font-mono">
                          dedup {rule.throttling.dedupWindowSeconds}s · max{' '}
                          {rule.throttling.maxDeliveriesPerHour}/hr · cooldown{' '}
                          {rule.throttling.cooldownSeconds}s
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Rule Builder Form */}
            <section aria-labelledby="rule-create-heading" className="card card-padding">
              <h2 id="rule-create-heading" className="heading-section mb-1">
                Build notification routing rule
              </h2>
              <p className="text-meta mb-4">
                Configure trigger source, threshold predicates, multi-channel templated payloads, and mandatory anti-storm throttling.
              </p>

              <form onSubmit={handleCreateRule} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-xs font-medium space-y-1">
                    <span>Rule name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., High-Severity Vault Invariant Breach Alert"
                      className="form-input w-full"
                      required
                    />
                  </label>
                  <label className="block text-xs font-medium space-y-1">
                    <span>Description</span>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Routes invariant violations to on-call and triage Slack..."
                      className="form-input w-full"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block text-xs font-medium space-y-1">
                    <span>Event source</span>
                    <select
                      value={eventSource}
                      onChange={(e) =>
                        setEventSource(e.target.value as NotificationEventSource)
                      }
                      className="form-input w-full"
                    >
                      <option value="crashes">crashes</option>
                      <option value="regressions">regressions</option>
                      <option value="ci_gates">ci_gates</option>
                      <option value="incidents">incidents</option>
                      <option value="data_quality">data_quality</option>
                    </select>
                  </label>

                  <label className="block text-xs font-medium space-y-1">
                    <span>Minimum severity threshold</span>
                    <select
                      value={minSeverity}
                      onChange={(e) =>
                        setMinSeverity(e.target.value as NotificationSeverity)
                      }
                      className="form-input w-full"
                    >
                      <option value="critical">critical</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                      <option value="info">info</option>
                    </select>
                  </label>

                  <label className="block text-xs font-medium space-y-1">
                    <span>Initial rollout stage</span>
                    <select
                      value={rolloutStage}
                      onChange={(e) =>
                        setRolloutStage(e.target.value as RolloutStage)
                      }
                      className="form-input w-full"
                    >
                      <option value="dry_run">dry_run (Shadow evaluation)</option>
                      <option value="canary_25">canary_25 (25% traffic)</option>
                      <option value="active">active (100% live)</option>
                    </select>
                  </label>
                </div>

                {/* Predicate Builder */}
                <fieldset className="rounded-xl border border-[var(--border-color)] p-3">
                  <legend className="text-xs font-semibold px-1">
                    Attribute Predicate Condition
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block text-xs space-y-1">
                      <span>Attribute field</span>
                      <input
                        type="text"
                        value={predicateField}
                        onChange={(e) => setPredicateField(e.target.value)}
                        className="form-input w-full font-mono"
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Operator</span>
                      <select
                        value={predicateOp}
                        onChange={(e) =>
                          setPredicateOp(e.target.value as PredicateOperator)
                        }
                        className="form-input w-full"
                      >
                        <option value="eq">equals (eq)</option>
                        <option value="neq">not equals (neq)</option>
                        <option value="gte">greater or equal (gte)</option>
                        <option value="lte">less or equal (lte)</option>
                        <option value="contains">contains</option>
                      </select>
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Expected value / threshold</span>
                      <input
                        type="text"
                        value={predicateValue}
                        onChange={(e) => setPredicateValue(e.target.value)}
                        className="form-input w-full font-mono"
                      />
                    </label>
                  </div>
                </fieldset>

                {/* Delivery Channel & Payload Template */}
                <fieldset className="rounded-xl border border-[var(--border-color)] p-3 space-y-3">
                  <legend className="text-xs font-semibold px-1">
                    Channel Target &amp; Payload Template
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs space-y-1">
                      <span>Channel type</span>
                      <select
                        value={channel}
                        onChange={(e) =>
                          setChannel(e.target.value as NotificationChannelType)
                        }
                        className="form-input w-full"
                      >
                        <option value="slack">Slack Channel / Webhook</option>
                        <option value="in_app">In-App Inbox</option>
                        <option value="email">Email Digest / Direct</option>
                        <option value="pagerduty">PagerDuty Service (Maintainer RBAC)</option>
                        <option value="webhook">Custom HTTP Webhook (Maintainer RBAC)</option>
                      </select>
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Recipient / endpoint</span>
                      <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        className="form-input w-full font-mono"
                        required
                      />
                    </label>
                  </div>
                  <label className="block text-xs space-y-1">
                    <span>Payload template (supports {'{{severity}}'}, {'{{contract}}'}, {'{{fingerprint}}'})</span>
                    <input
                      type="text"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="form-input w-full font-mono"
                      required
                    />
                  </label>
                </fieldset>

                {/* Safe Anti-Storm Throttling & Deduplication */}
                <fieldset className="rounded-xl border border-[var(--border-color)] p-3">
                  <legend className="text-xs font-semibold px-1">
                    Deduplication, Grouping &amp; Anti-Storm Rate Limits
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <label className="block text-xs space-y-1">
                      <span>Dedup window (seconds)</span>
                      <input
                        type="number"
                        min={30}
                        max={86400}
                        value={dedupWindowSeconds}
                        onChange={(e) => setDedupWindowSeconds(Number(e.target.value))}
                        className="form-input w-full"
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Max deliveries / hour</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={maxDeliveriesPerHour}
                        onChange={(e) => setMaxDeliveriesPerHour(Number(e.target.value))}
                        className="form-input w-full"
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Cooldown (seconds)</span>
                      <input
                        type="number"
                        min={15}
                        max={86400}
                        value={cooldownSeconds}
                        onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                        className="form-input w-full"
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span>Grouping keys</span>
                      <input
                        type="text"
                        value={groupingKeysInput}
                        onChange={(e) => setGroupingKeysInput(e.target.value)}
                        className="form-input w-full font-mono"
                      />
                    </label>
                  </div>
                </fieldset>

                <button type="submit" className="btn-primary text-xs px-4 py-2">
                  Create routing rule
                </button>
              </form>
            </section>
          </div>
        )}
      </div>

      {/* Tab 2: Escalation Policies & Ack */}
      <div
        role="tabpanel"
        id="notif-panel-escalations"
        aria-labelledby="notif-tab-escalations"
        hidden={activeTab !== 'escalations'}
      >
        {activeTab === 'escalations' && (
          <EscalationPolicyEditor
            policies={state.escalationPolicies}
            incidents={state.incidents}
            onCreatePolicy={state.createEscalationPolicy}
            onTransitionIncident={state.transitionIncident}
          />
        )}
      </div>

      {/* Tab 3: Schedules & Maintenance */}
      <div
        role="tabpanel"
        id="notif-panel-schedules"
        aria-labelledby="notif-tab-schedules"
        hidden={activeTab !== 'schedules'}
      >
        {activeTab === 'schedules' && (
          <RoutingSchedules
            schedules={state.schedules}
            maintenanceWindows={state.maintenanceWindows}
            onAddOverride={state.addScheduleOverride}
            onUpdateQuietHours={state.updateQuietHours}
            onToggleMaintenanceWindow={state.toggleMaintenanceWindow}
          />
        )}
      </div>

      {/* Tab 4: Rule Simulator */}
      <div
        role="tabpanel"
        id="notif-panel-simulator"
        aria-labelledby="notif-tab-simulator"
        hidden={activeTab !== 'simulator'}
      >
        {activeTab === 'simulator' && (
          <RuleSimulator
            workspace={state.workspace}
            previews={state.simulationPreviews}
            onRunSimulation={state.runSimulation}
          />
        )}
      </div>

      {/* Tab 5: Governance, Approvals & Audit History */}
      <div
        role="tabpanel"
        id="notif-panel-governance"
        aria-labelledby="notif-tab-governance"
        hidden={activeTab !== 'governance'}
      >
        {activeTab === 'governance' && (
          <div className="space-y-6">
            <section aria-labelledby="gov-approvals-heading" className="card card-padding space-y-4">
              <div>
                <h2 id="gov-approvals-heading" className="heading-section mb-1">
                  Policy approvals &amp; staged rollout governance
                </h2>
                <p className="text-meta">
                  Rules created by analysts or targeting sensitive channels enter pending approval until a maintainer signs off.
                </p>
              </div>

              <div className="space-y-2">
                {state.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] p-3 text-xs"
                  >
                    <div>
                      <strong>{rule.name}</strong>{' '}
                      <span className="font-mono text-meta">
                        ({rule.id} · v{rule.version} · {rule.approvalStatus})
                      </span>
                      {rule.approvedBy && (
                        <span className="ml-2 text-meta">
                          Approved by <strong>{rule.approvedBy}</strong>
                        </span>
                      )}
                    </div>
                    {rule.approvalStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() =>
                          void state.updateRule(rule.id, {
                            approvalStatus: 'approved',
                            rolloutStage: 'active',
                          })
                        }
                        className="btn-primary text-xs px-3 py-1"
                      >
                        Approve &amp; promote to active
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="gov-audit-heading" className="card card-padding space-y-4">
              <h2 id="gov-audit-heading" className="heading-section">
                Immutable policy audit log ({state.auditHistory.length})
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    Notification policy change and approval audit trail
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left">
                      <th scope="col" className="py-2 pr-3">Timestamp</th>
                      <th scope="col" className="py-2 pr-3">Actor</th>
                      <th scope="col" className="py-2 pr-3">Action</th>
                      <th scope="col" className="py-2 pr-3">Target</th>
                      <th scope="col" className="py-2">Version Diff Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.auditHistory.map((entry) => (
                      <tr key={entry.id} className="border-b border-[var(--border-color)]">
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {entry.at.slice(0, 19).replace('T', ' ')}Z
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {entry.actor} ({entry.actorRole})
                        </td>
                        <td className="py-2 pr-3 font-semibold">{entry.action}</td>
                        <td className="py-2 pr-3 font-mono">
                          {entry.targetId} (v{entry.version})
                        </td>
                        <td className="py-2 text-meta">{entry.diffSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
export default NotificationRulesBuilder;
