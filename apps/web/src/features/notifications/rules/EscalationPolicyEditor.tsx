'use client';

/**
 * EscalationPolicyEditor — manages multi-tier escalation policies, timeouts,
 * fallback recipients, and live acknowledgment/escalation/resolve tracking (#2316).
 */

import React, { useState } from 'react';
import type {
  ActiveEscalationIncident,
  EscalationPolicy,
  EscalationTier,
  IncidentAckState,
} from '@/app/api/escalation-policies/route';

export interface EscalationPolicyEditorProps {
  policies: readonly EscalationPolicy[];
  incidents: readonly ActiveEscalationIncident[];
  onCreatePolicy: (input: {
    name: string;
    description: string;
    tiers: EscalationTier[];
    fallbackRecipients: string[];
  }) => Promise<boolean>;
  onTransitionIncident: (id: string, state: IncidentAckState) => Promise<void>;
}

export function EscalationPolicyEditor({
  policies,
  incidents,
  onCreatePolicy,
  onTransitionIncident,
}: EscalationPolicyEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier1Target, setTier1Target] = useState('oncall:contract-primary');
  const [tier1Timeout, setTier1Timeout] = useState(5);
  const [tier2Target, setTier2Target] = useState('team:soroban-security-leads');
  const [tier2Timeout, setTier2Timeout] = useState(15);
  const [fallbackInput, setFallbackInput] = useState('noc-fallback@crashlab.internal');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const tiers: EscalationTier[] = [
      {
        level: 1,
        timeoutMinutes: Math.max(1, tier1Timeout),
        targets: [tier1Target.trim() || 'oncall:primary'],
        channels: ['pagerduty', 'slack'],
      },
      {
        level: 2,
        timeoutMinutes: Math.max(1, tier2Timeout),
        targets: [tier2Target.trim() || 'team:leads'],
        channels: ['pagerduty', 'slack', 'email'],
      },
    ];
    const fallbackRecipients = fallbackInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const ok = await onCreatePolicy({
      name: name.trim(),
      description: description.trim(),
      tiers,
      fallbackRecipients,
    });
    if (ok) {
      setName('');
      setDescription('');
    }
  };

  return (
    <div className="space-y-6" data-testid="escalation-policy-editor">
      {/* Active Escalation Incidents & Acknowledgment Tracking */}
      <section aria-labelledby="esc-active-incidents-heading" className="card card-padding space-y-4">
        <div>
          <h2 id="esc-active-incidents-heading" className="heading-section mb-1">
            Active escalations &amp; acknowledgment tracking
          </h2>
          <p className="text-meta">
            Track live triggered notifications across escalation tiers, acknowledge ownership, or escalate/resolve incidents.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">
              Active escalation incidents and acknowledgment status
            </caption>
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left">
                <th scope="col" className="py-2 pr-3">Incident</th>
                <th scope="col" className="py-2 pr-3">Policy</th>
                <th scope="col" className="py-2 pr-3">Tier</th>
                <th scope="col" className="py-2 pr-3">Assigned</th>
                <th scope="col" className="py-2 pr-3">State</th>
                <th scope="col" className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} className="border-b border-[var(--border-color)]">
                  <th scope="row" className="py-2.5 pr-3 font-medium text-left">
                    <span className="font-mono text-[11px] text-meta mr-1.5">{inc.id}</span>
                    {inc.title}
                  </th>
                  <td className="py-2.5 pr-3 font-mono">{inc.policyId}</td>
                  <td className="py-2.5 pr-3 font-semibold">Tier {inc.currentTierLevel}</td>
                  <td className="py-2.5 pr-3 font-mono">{inc.assignedTo}</td>
                  <td className="py-2.5 pr-3">
                    <span className="rounded-full border border-[var(--border-color)] px-2 py-0.5 uppercase text-[10px] font-semibold">
                      {inc.state}
                    </span>
                  </td>
                  <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                    {inc.state !== 'acknowledged' && inc.state !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => void onTransitionIncident(inc.id, 'acknowledged')}
                        className="btn-primary text-xs px-2.5 py-1"
                      >
                        Acknowledge
                      </button>
                    )}
                    {inc.state !== 'resolved' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void onTransitionIncident(inc.id, 'escalated')}
                          className="btn-outline text-xs px-2.5 py-1"
                        >
                          Escalate Tier
                        </button>
                        <button
                          type="button"
                          onClick={() => void onTransitionIncident(inc.id, 'resolved')}
                          className="btn-outline text-xs px-2.5 py-1"
                        >
                          Resolve
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Configured Escalation Policies Catalog */}
      <section aria-labelledby="esc-catalog-heading" className="card card-padding space-y-4">
        <div>
          <h2 id="esc-catalog-heading" className="heading-section mb-1">
            Escalation policies ({policies.length})
          </h2>
          <p className="text-meta">
            Multi-tier timeout chains with fallback recipients when primary responders do not acknowledge within SLA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((policy) => (
            <article
              key={policy.id}
              className="rounded-xl border border-[var(--border-color)] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-meta">{policy.id} · v{policy.version}</span>
                  <h3 className="text-sm font-semibold">{policy.name}</h3>
                </div>
                <span className="text-xs text-meta">
                  Auto-resolve {policy.autoResolveMinutes}m
                </span>
              </div>
              <p className="text-xs text-meta">{policy.description}</p>

              <ol className="space-y-2 text-xs">
                {policy.tiers.map((tier) => (
                  <li
                    key={tier.level}
                    className="rounded-lg bg-[var(--hover-bg)] p-2.5 border border-[var(--border-color)]"
                  >
                    <div className="flex justify-between font-semibold">
                      <span>Tier {tier.level}</span>
                      <span>Timeout: {tier.timeoutMinutes} min</span>
                    </div>
                    <div className="mt-1 text-meta">
                      Targets: <span className="font-mono">{tier.targets.join(', ')}</span>
                    </div>
                    <div className="text-meta">
                      Channels: <span className="font-mono">{tier.channels.join(', ')}</span>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="text-xs text-meta pt-1 border-t border-[var(--border-color)]">
                <strong>Fallback recipients:</strong>{' '}
                <span className="font-mono">{policy.fallbackRecipients.join(', ')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* New Escalation Policy Builder Form */}
      <section aria-labelledby="esc-builder-form-heading" className="card card-padding">
        <h2 id="esc-builder-form-heading" className="heading-section mb-1">
          Create escalation policy
        </h2>
        <p className="text-meta mb-4">
          Define tiered responder handoffs and guaranteed fallback recipients.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium space-y-1">
              <span>Policy name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Soroban Mainnet Bridge Incident Escalation"
                className="form-input w-full"
                required
              />
            </label>
            <label className="block text-xs font-medium space-y-1">
              <span>Fallback recipients (comma-separated)</span>
              <input
                type="text"
                value={fallbackInput}
                onChange={(e) => setFallbackInput(e.target.value)}
                className="form-input w-full"
                required
              />
            </label>
          </div>

          <label className="block text-xs font-medium space-y-1">
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Escalation path when tier-1 responder does not acknowledge..."
              className="form-input w-full"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--border-color)] p-3 space-y-2">
              <div className="text-xs font-semibold">Tier 1 (Initial Responder)</div>
              <label className="block text-xs space-y-1">
                <span>Target</span>
                <input
                  type="text"
                  value={tier1Target}
                  onChange={(e) => setTier1Target(e.target.value)}
                  className="form-input w-full"
                />
              </label>
              <label className="block text-xs space-y-1">
                <span>Escalation timeout (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={tier1Timeout}
                  onChange={(e) => setTier1Timeout(Number(e.target.value))}
                  className="form-input w-full"
                />
              </label>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] p-3 space-y-2">
              <div className="text-xs font-semibold">Tier 2 (Secondary Lead)</div>
              <label className="block text-xs space-y-1">
                <span>Target</span>
                <input
                  type="text"
                  value={tier2Target}
                  onChange={(e) => setTier2Target(e.target.value)}
                  className="form-input w-full"
                />
              </label>
              <label className="block text-xs space-y-1">
                <span>Escalation timeout (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={tier2Timeout}
                  onChange={(e) => setTier2Timeout(Number(e.target.value))}
                  className="form-input w-full"
                />
              </label>
            </div>
          </div>

          <button type="submit" className="btn-primary text-xs px-4 py-2">
            Save escalation policy
          </button>
        </form>
      </section>
    </div>
  );
}
export default EscalationPolicyEditor;
