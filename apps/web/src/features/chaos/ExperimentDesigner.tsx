'use client';

/**
 * Experiment designer (#2340): templates, target selection, fault
 * parameters, duration/schedule, guardrails and halt rules, with a server
 * dry run (impact + preflight) before saving. Saving never starts anything.
 */

import { useState } from 'react';
import { GuardrailsPanel } from './GuardrailsPanel';
import type { ChaosState } from './hooks/useChaosExperiments';
import type { PreflightResult } from './lib/guardrails';
import {
  ENVIRONMENTS,
  FAULT_TYPES,
  HALT_METRICS,
  describeHaltRule,
  type ExperimentDefinition,
  type FaultSpec,
  type FaultType,
  type HaltRule,
} from './lib/model';

const FAULT_DEFAULTS: Record<FaultType, FaultSpec> = {
  latency: { type: 'latency', latencyMs: 500, jitterMs: 100 },
  error: { type: 'error', errorRate: 0.1, statusCode: 503 },
  drop: { type: 'drop', dropRate: 0.05 },
  throttle: { type: 'throttle', requestsPerSecond: 50 },
  'cpu-pressure': { type: 'cpu-pressure', cpuPercent: 70 },
  'memory-pressure': { type: 'memory-pressure', memoryMb: 512 },
};

const FAULT_FIELDS: Record<FaultType, Array<{ key: string; label: string; step?: number; min: number; max: number }>> = {
  latency: [
    { key: 'latencyMs', label: 'Latency (ms)', min: 1, max: 30_000 },
    { key: 'jitterMs', label: 'Jitter (ms)', min: 0, max: 30_000 },
  ],
  error: [
    { key: 'errorRate', label: 'Error rate (0–1)', step: 0.01, min: 0.01, max: 1 },
    { key: 'statusCode', label: 'Status code', min: 400, max: 599 },
  ],
  drop: [{ key: 'dropRate', label: 'Drop rate (0–1)', step: 0.01, min: 0.01, max: 1 }],
  throttle: [{ key: 'requestsPerSecond', label: 'Requests / s', min: 1, max: 10_000 }],
  'cpu-pressure': [{ key: 'cpuPercent', label: 'CPU %', min: 1, max: 95 }],
  'memory-pressure': [{ key: 'memoryMb', label: 'Memory (MB)', min: 16, max: 16_384 }],
};

export const BLANK_DEFINITION: ExperimentDefinition = {
  name: '',
  hypothesis: '',
  targets: [],
  faults: [FAULT_DEFAULTS.latency],
  durationSec: 120,
  scheduledAt: null,
  guardrails: { maxBlastRadiusPct: 5, maxConcurrentTargets: 2, environmentAllowlist: ['dev'], maintenanceWindowOnly: true, requiredApprovals: 1 },
  haltRules: [{ metric: 'error_rate', comparator: 'gt', threshold: 0.1, forSamples: 2 }],
  tags: [],
};

export interface ExperimentDesignerProps {
  state: ChaosState;
  initial: ExperimentDefinition;
  experimentId?: string;
  onSaved?: () => void;
}

export function ExperimentDesigner({ state, initial, experimentId, onSaved }: ExperimentDesignerProps) {
  const [definition, setDefinition] = useState<ExperimentDefinition>(initial);
  const [dry, setDry] = useState<PreflightResult | null>(null);
  const [newFault, setNewFault] = useState<FaultType>('error');
  const inventory = state.list?.inventory ?? [];
  const canEdit = Boolean(state.viewer && state.viewer.role !== 'anonymous');
  const update = (patch: Partial<ExperimentDefinition>) => {
    setDefinition((previous) => ({ ...previous, ...patch }));
    setDry(null);
  };
  const toggleTarget = (kind: string, id: string) => {
    const exists = definition.targets.some((target) => target.kind === kind && target.id === id);
    update({
      targets: exists
        ? definition.targets.filter((target) => !(target.kind === kind && target.id === id))
        : [...definition.targets, { kind: kind as ExperimentDefinition['targets'][number]['kind'], id }],
    });
  };
  const updateFault = (index: number, key: string, value: number) =>
    update({ faults: definition.faults.map((fault, position) => (position === index ? ({ ...fault, [key]: value } as FaultSpec) : fault)) });
  const updateRule = (index: number, patch: Partial<HaltRule>) =>
    update({ haltRules: definition.haltRules.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)) });

  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Experiment designer"
      onSubmit={(event) => {
        event.preventDefault();
        void state.save(definition, experimentId).then((saved) => {
          if (saved) onSaved?.();
        });
      }}
    >
      <section className="card card-padding grid gap-2 sm:grid-cols-2">
        <h2 className="text-sm-semibold sm:col-span-2">{experimentId ? `Edit ${experimentId}` : 'New experiment'}</h2>
        {!experimentId ? (
          <label className="text-sm flex flex-col gap-1 sm:col-span-2">
            <span className="input-label">Start from a template</span>
            <select
              className="input-field"
              defaultValue=""
              onChange={(event) => {
                const template = state.list?.templates.find((candidate) => candidate.id === event.target.value);
                if (template) {
                  setDefinition(template.definition);
                  setDry(null);
                }
              }}
            >
              <option value="">Blank</option>
              {(state.list?.templates ?? []).map((template) => (
                <option key={template.id} value={template.id} title={template.description}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Name</span>
          <input className="input-field" required minLength={3} value={definition.name} onChange={(event) => update({ name: event.target.value })} />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Duration (seconds)</span>
          <input
            className="input-field"
            type="number"
            min={30}
            max={3_600}
            value={definition.durationSec}
            onChange={(event) => update({ durationSec: Number(event.target.value) })}
          />
        </label>
        <label className="text-sm flex flex-col gap-1 sm:col-span-2">
          <span className="input-label">Hypothesis</span>
          <textarea className="input-field" rows={2} required minLength={10} value={definition.hypothesis} onChange={(event) => update({ hypothesis: event.target.value })} />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Schedule (UTC, optional)</span>
          <input
            className="input-field"
            type="datetime-local"
            value={definition.scheduledAt ? definition.scheduledAt.slice(0, 16) : ''}
            onChange={(event) => update({ scheduledAt: event.target.value ? new Date(`${event.target.value}:00Z`).toISOString() : null })}
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Tags (comma-separated)</span>
          <input
            className="input-field"
            value={definition.tags.join(', ')}
            onChange={(event) => update({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 10) })}
          />
        </label>
      </section>

      <fieldset className="card card-padding">
        <legend className="text-sm-semibold">Targets</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {inventory.map((target) => (
            <label key={`${target.kind}:${target.id}`} className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={definition.targets.some((ref) => ref.kind === target.kind && ref.id === target.id)}
                onChange={() => toggleTarget(target.kind, target.id)}
              />
              <span>
                {target.label} <span className="text-meta">· {target.kind} · {target.environment}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card card-padding flex flex-col gap-2">
        <legend className="text-sm-semibold">Faults</legend>
        {definition.faults.map((fault, index) => (
          <div key={fault.type} className="flex flex-wrap items-end gap-2">
            <span className="ds-badge ds-badge-info">{fault.type}</span>
            {FAULT_FIELDS[fault.type].map((field) => (
              <label key={field.key} className="text-sm flex flex-col gap-1">
                <span className="input-label">{field.label}</span>
                <input
                  className="input-field w-32"
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={(fault as unknown as Record<string, number>)[field.key]}
                  onChange={(event) => updateFault(index, field.key, Number(event.target.value))}
                />
              </label>
            ))}
            <button
              type="button"
              className="btn-ghost text-xs"
              aria-label={`Remove ${fault.type} fault`}
              disabled={definition.faults.length === 1}
              onClick={() => update({ faults: definition.faults.filter((_, position) => position !== index) })}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <select className="input-field" aria-label="Fault type to add" value={newFault} onChange={(event) => setNewFault(event.target.value as FaultType)}>
            {FAULT_TYPES.filter((type) => !definition.faults.some((fault) => fault.type === type)).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={definition.faults.length >= 4 || definition.faults.some((fault) => fault.type === newFault)}
            onClick={() => update({ faults: [...definition.faults, FAULT_DEFAULTS[newFault]] })}
          >
            Add fault
          </button>
        </div>
      </fieldset>

      <fieldset className="card card-padding grid gap-2 sm:grid-cols-3">
        <legend className="text-sm-semibold">Guardrails</legend>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Max blast radius (% of capacity)</span>
          <input
            className="input-field"
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={definition.guardrails.maxBlastRadiusPct}
            onChange={(event) => update({ guardrails: { ...definition.guardrails, maxBlastRadiusPct: Number(event.target.value) } })}
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Max concurrent targets</span>
          <input
            className="input-field"
            type="number"
            min={1}
            max={20}
            value={definition.guardrails.maxConcurrentTargets}
            onChange={(event) => update({ guardrails: { ...definition.guardrails, maxConcurrentTargets: Number(event.target.value) } })}
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span className="input-label">Required approvals (prod always ≥ 2)</span>
          <input
            className="input-field"
            type="number"
            min={0}
            max={3}
            value={definition.guardrails.requiredApprovals}
            onChange={(event) => update({ guardrails: { ...definition.guardrails, requiredApprovals: Number(event.target.value) } })}
          />
        </label>
        <fieldset className="text-sm flex gap-3 items-center sm:col-span-2">
          <legend className="input-label">Environment allowlist</legend>
          {ENVIRONMENTS.map((environment) => (
            <label key={environment} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={definition.guardrails.environmentAllowlist.includes(environment)}
                onChange={(event) =>
                  update({
                    guardrails: {
                      ...definition.guardrails,
                      environmentAllowlist: event.target.checked
                        ? [...definition.guardrails.environmentAllowlist, environment]
                        : definition.guardrails.environmentAllowlist.filter((value) => value !== environment),
                    },
                  })
                }
              />
              {environment}
            </label>
          ))}
        </fieldset>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={definition.guardrails.maintenanceWindowOnly}
            onChange={(event) => update({ guardrails: { ...definition.guardrails, maintenanceWindowOnly: event.target.checked } })}
          />
          Only inside maintenance windows
        </label>
      </fieldset>

      <fieldset className="card card-padding flex flex-col gap-2">
        <legend className="text-sm-semibold">Automatic halt rules</legend>
        {definition.haltRules.map((rule, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <select className="input-field" aria-label="Halt metric" value={rule.metric} onChange={(event) => updateRule(index, { metric: event.target.value as HaltRule['metric'] })}>
              {HALT_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {metric}
                </option>
              ))}
            </select>
            <select className="input-field" aria-label="Comparator" value={rule.comparator} onChange={(event) => updateRule(index, { comparator: event.target.value as 'gt' | 'lt' })}>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
            </select>
            <input
              className="input-field w-28"
              type="number"
              step="any"
              aria-label="Threshold"
              value={rule.threshold}
              onChange={(event) => updateRule(index, { threshold: Number(event.target.value) })}
            />
            <label className="text-sm flex items-center gap-1">
              for
              <input
                className="input-field w-16"
                type="number"
                min={1}
                max={10}
                value={rule.forSamples}
                onChange={(event) => updateRule(index, { forSamples: Number(event.target.value) })}
              />
              samples
            </label>
            <span className="text-meta text-xs">Halts when {describeHaltRule(rule)}.</span>
            <button
              type="button"
              className="btn-ghost text-xs"
              aria-label={`Remove halt rule ${index + 1}`}
              disabled={definition.haltRules.length === 1}
              onClick={() => update({ haltRules: definition.haltRules.filter((_, position) => position !== index) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-outline text-xs self-start"
          disabled={definition.haltRules.length >= 8}
          onClick={() => update({ haltRules: [...definition.haltRules, { metric: 'p95_latency_ms', comparator: 'gt', threshold: 2_000, forSamples: 2 }] })}
        >
          Add halt rule
        </button>
      </fieldset>

      <GuardrailsPanel result={dry} title="Dry run" />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-outline"
          disabled={!canEdit || state.busy}
          onClick={() =>
            void state.dryRun(definition).then((result) => {
              if (result) setDry(result);
            })
          }
        >
          Dry run
        </button>
        <button type="submit" className="btn-primary" disabled={!canEdit || state.busy}>
          {experimentId ? 'Save new version' : 'Save draft'}
        </button>
        {!canEdit ? <span className="text-meta text-sm">Sign in to design experiments.</span> : null}
      </div>
    </form>
  );
}
