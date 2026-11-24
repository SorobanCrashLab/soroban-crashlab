'use client';

/**
 * RuleSimulator — deterministic testing of notification rules against sample
 * or historical events, showing matched recipients, rendered templated payloads,
 * and deduplication/throttling/quiet-hours/maintenance suppression reasons (#2316).
 */

import React, { useState } from 'react';
import type {
  NotificationEventSource,
  NotificationSeverity,
  RuleSimulationDeliveryPreview,
  SampleSimulationEvent,
} from '@/app/api/notification-rules/route';

export interface RuleSimulatorProps {
  workspace: string;
  previews: readonly RuleSimulationDeliveryPreview[];
  onRunSimulation: (
    event: SampleSimulationEvent,
    quietHoursActive: boolean,
  ) => Promise<void>;
}

const SAMPLE_PRESETS: readonly {
  label: string;
  event: Omit<SampleSimulationEvent, 'workspace'>;
}[] = [
  {
    label: 'Critical Contract Reentrancy Crash (New Signature)',
    event: {
      id: 'sim-crash-01',
      eventSource: 'crashes',
      severity: 'critical',
      timestampIso: '2026-11-22T01:00:00.000Z',
      fingerprint: 'sig-reentrancy-0x9f2a',
      attributes: {
        contract: 'token.swap',
        is_new_signature: 'true',
        crash_count: 4,
      },
      recentCountInHour: 2,
      duplicateWithinWindow: false,
    },
  },
  {
    label: 'CI Gate Bundle Budget Regression',
    event: {
      id: 'sim-ci-02',
      eventSource: 'ci_gates',
      severity: 'high',
      timestampIso: '2026-11-22T01:05:00.000Z',
      fingerprint: 'sig-ci-budget-runs-id',
      attributes: {
        branch: 'main',
        gate_status: 'fail',
        summary: 'First-load JS exceeded budget by 4.2 KB',
      },
      recentCountInHour: 1,
      duplicateWithinWindow: false,
    },
  },
  {
    label: 'Telemetry Schema Drift (>5%)',
    event: {
      id: 'sim-dq-03',
      eventSource: 'data_quality',
      severity: 'medium',
      timestampIso: '2026-11-22T01:10:00.000Z',
      fingerprint: 'sig-dq-drift-07',
      attributes: {
        drift_pct: 8.5,
        contract: 'vault.deposit',
      },
      recentCountInHour: 0,
      duplicateWithinWindow: false,
    },
  },
];

export function RuleSimulator({
  workspace,
  previews,
  onRunSimulation,
}: RuleSimulatorProps) {
  const [eventSource, setEventSource] = useState<NotificationEventSource>('crashes');
  const [severity, setSeverity] = useState<NotificationSeverity>('critical');
  const [fingerprint, setFingerprint] = useState('sig-reentrancy-0x9f2a');
  const [contractName, setContractName] = useState('token.swap');
  const [isNewSignature, setIsNewSignature] = useState(true);
  const [recentCountInHour, setRecentCountInHour] = useState(1);
  const [duplicateWithinWindow, setDuplicateWithinWindow] = useState(false);
  const [quietHoursActive, setQuietHoursActive] = useState(false);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    const simEvent: SampleSimulationEvent = {
      id: `sim-${Date.now()}`,
      workspace,
      eventSource,
      severity,
      timestampIso: new Date().toISOString(),
      fingerprint: fingerprint.trim() || 'sig-sample-001',
      attributes: {
        contract: contractName.trim() || 'token.swap',
        is_new_signature: String(isNewSignature),
        crash_count: 3,
        gate_status: 'fail',
        branch: 'main',
        summary: 'Simulated regression payload',
        drift_pct: 9.2,
      },
      recentCountInHour,
      duplicateWithinWindow,
    };
    await onRunSimulation(simEvent, quietHoursActive);
  };

  const applyPreset = (idx: number) => {
    const preset = SAMPLE_PRESETS[idx];
    if (!preset) return;
    setEventSource(preset.event.eventSource);
    setSeverity(preset.event.severity);
    setFingerprint(preset.event.fingerprint);
    if (typeof preset.event.attributes.contract === 'string') {
      setContractName(preset.event.attributes.contract);
    }
    setRecentCountInHour(preset.event.recentCountInHour ?? 0);
    setDuplicateWithinWindow(Boolean(preset.event.duplicateWithinWindow));
  };

  return (
    <div className="space-y-6" data-testid="notification-rule-simulator">
      <section aria-labelledby="sim-form-heading" className="card card-padding space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="sim-form-heading" className="heading-section mb-1">
              Deterministic rule simulator &amp; delivery preview
            </h2>
            <p className="text-meta">
              Test routing rules against historical or synthetic events to inspect matched recipients, rendered templates, and deduplication/throttle suppression before rollout.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SAMPLE_PRESETS.map((preset, idx) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(idx)}
                className="btn-outline text-xs px-2.5 py-1"
              >
                Load preset {idx + 1}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSimulate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block text-xs font-medium space-y-1">
              <span>Event source</span>
              <select
                value={eventSource}
                onChange={(e) => setEventSource(e.target.value as NotificationEventSource)}
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
              <span>Event severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as NotificationSeverity)}
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
              <span>Target contract / component</span>
              <input
                type="text"
                value={contractName}
                onChange={(e) => setContractName(e.target.value)}
                className="form-input w-full"
              />
            </label>

            <label className="block text-xs font-medium space-y-1">
              <span>Dedup fingerprint</span>
              <input
                type="text"
                value={fingerprint}
                onChange={(e) => setFingerprint(e.target.value)}
                className="form-input w-full font-mono"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center pt-1">
            <label className="block text-xs font-medium space-y-1">
              <span>Deliveries in past hour</span>
              <input
                type="number"
                min={0}
                max={500}
                value={recentCountInHour}
                onChange={(e) => setRecentCountInHour(Number(e.target.value))}
                className="form-input w-full"
              />
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={isNewSignature}
                onChange={(e) => setIsNewSignature(e.target.checked)}
              />
              <span>New crash signature</span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={duplicateWithinWindow}
                onChange={(e) => setDuplicateWithinWindow(e.target.checked)}
              />
              <span>Simulate duplicate within window</span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={quietHoursActive}
                onChange={(e) => setQuietHoursActive(e.target.checked)}
              />
              <span>Simulate during quiet hours</span>
            </label>
          </div>

          <button type="submit" className="btn-primary text-xs px-4 py-2">
            Simulate event routing
          </button>
        </form>
      </section>

      {/* Delivery Previews & Suppression Results */}
      {previews.length > 0 && (
        <section aria-labelledby="sim-results-heading" className="card card-padding space-y-4">
          <h2 id="sim-results-heading" className="heading-section">
            Simulation results ({previews.length} evaluated rules)
          </h2>

          <div className="space-y-3">
            {previews.map((item) => (
              <article
                key={item.ruleId}
                className="rounded-xl border border-[var(--border-color)] p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-meta mr-2">{item.ruleId}</span>
                    <strong className="text-sm">{item.ruleName}</strong>
                  </div>
                  <span className="rounded-full border border-[var(--border-color)] px-2.5 py-0.5 text-xs font-semibold">
                    {!item.matched
                      ? 'Did not match predicates'
                      : item.suppressed
                        ? 'Matched · Suppressed'
                        : '✓ Will Deliver'}
                  </span>
                </div>

                {item.suppressionReasons.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg p-2.5">
                    <strong>Suppression reasons:</strong> {item.suppressionReasons.join(' · ')}
                  </div>
                )}

                {item.matchedActions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs font-semibold text-meta">
                      Rendered channel payloads ({item.matchedActions.length}):
                    </div>
                    {item.matchedActions.map((act, idx) => (
                      <div
                        key={`${act.channel}-${idx}`}
                        className="rounded-lg bg-[var(--hover-bg)] p-2.5 text-xs font-mono"
                      >
                        <div>
                          <strong>[{act.channel.toUpperCase()}]</strong> → {act.recipient}
                        </div>
                        <div className="mt-1 text-meta break-all">{act.renderedPayload}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
export default RuleSimulator;
