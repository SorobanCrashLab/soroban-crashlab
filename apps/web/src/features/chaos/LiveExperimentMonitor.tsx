'use client';

/**
 * Live experiment monitor (#2340): status, lifecycle controls (with typed
 * confirmation for start), always-visible abort, live metrics with halt
 * thresholds, and the event log. High-risk controls are large, labelled and
 * keyboard reachable; status changes are announced.
 */

import { useState } from 'react';
import { GuardrailsPanel } from './GuardrailsPanel';
import type { ChaosState, DetailPayload } from './hooks/useChaosExperiments';
import { describeFault, describeHaltRule, type HaltRule } from './lib/model';
import { metricValue, type TelemetrySample } from './lib/monitor';

const SERIES: Array<{ key: keyof TelemetrySample & string; metric: HaltRule['metric'] | null; label: string; format: (value: number) => string }> = [
  { key: 'errorRate', metric: 'error_rate', label: 'Error rate', format: (value) => `${(value * 100).toFixed(1)}%` },
  { key: 'p95LatencyMs', metric: 'p95_latency_ms', label: 'p95 latency', format: (value) => `${Math.round(value)} ms` },
  { key: 'sloBurnRate', metric: 'slo_burn_rate', label: 'SLO burn rate', format: (value) => `${value.toFixed(1)}×` },
  { key: 'dataQuality', metric: 'data_quality_score', label: 'Data quality', format: (value) => value.toFixed(3) },
  { key: 'cpuPct', metric: null, label: 'CPU', format: (value) => `${value.toFixed(0)}%` },
];

function Sparkline({ samples, seriesKey, threshold }: { samples: TelemetrySample[]; seriesKey: keyof TelemetrySample; threshold?: number }) {
  const values = samples.map((sample) => Number(sample[seriesKey]));
  const max = Math.max(threshold ?? 0, ...values, 1e-9);
  const min = Math.min(0, ...values);
  const width = 220;
  const height = 48;
  const x = (index: number) => (values.length <= 1 ? 0 : (index / (values.length - 1)) * width);
  const y = (value: number) => height - ((value - min) / (max - min || 1)) * height;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      {threshold !== undefined ? <line x1={0} x2={width} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeDasharray="4 3" strokeOpacity={0.7} /> : null}
      <polyline fill="none" stroke="var(--accent, #0A66C2)" strokeWidth={2} points={values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
    </svg>
  );
}

export function LiveExperimentMonitor({ state, detail, onEdit }: { state: ChaosState; detail: DetailPayload; onEdit?: () => void }) {
  const { experiment, samples } = detail;
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const can = (action: DetailPayload['allowedActions'][number]) => detail.allowedActions.includes(action);
  const last = samples[samples.length - 1];
  const elapsed = last ? Math.round(last.t / 1_000) : 0;
  const control = (action: Parameters<ChaosState['control']>[1]['action'], extra: { confirmation?: string; reason?: string; note?: string } = {}) =>
    void state.control(experiment.id, { action, ...extra });

  return (
    <div className="flex flex-col gap-3">
      <section className="card card-padding flex flex-col gap-2" aria-label="Experiment status">
        <div className="flex-between flex-wrap gap-2">
          <h2 className="text-sm-semibold">
            {experiment.definition.name} <span className="text-meta">v{experiment.version}</span>
          </h2>
          <span
            role="status"
            aria-live="polite"
            className={`ds-badge ${experiment.status === 'running' ? 'ds-badge-warning' : experiment.status === 'halted' || experiment.status === 'aborted' ? 'ds-badge-error' : experiment.status === 'completed' ? 'ds-badge-success' : 'ds-badge-neutral'}`}
          >
            {experiment.status}
          </span>
        </div>
        <p className="text-sm">{experiment.definition.hypothesis}</p>
        <p className="text-meta text-xs">
          {experiment.definition.faults.map(describeFault).join(' + ')} on {experiment.definition.targets.map((target) => target.id).join(', ')} ·{' '}
          {experiment.definition.durationSec} s · halts when {experiment.definition.haltRules.map(describeHaltRule).join(' or ')}
        </p>
        {detail.executor === 'simulated' ? (
          <p className="text-meta text-xs">Executor: simulated — controls, guardrails and telemetry run end to end, but no real traffic is altered.</p>
        ) : null}
        {experiment.status === 'running' ? (
          <div className="w-full h-2 rounded bg-token-border" role="progressbar" aria-valuemin={0} aria-valuemax={experiment.definition.durationSec} aria-valuenow={elapsed} aria-label="Elapsed time">
            <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.min(100, (elapsed / experiment.definition.durationSec) * 100)}%` }} />
          </div>
        ) : null}
        {experiment.endReason ? <p className="text-sm">{experiment.endReason}</p> : null}
        {experiment.approvals.length > 0 ? (
          <p className="text-meta text-xs">Approved by {experiment.approvals.map((approval) => approval.by).join(', ')}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 mt-1">
          {can('submit') ? (
            <>
              <button type="button" className="btn-primary text-xs" disabled={state.busy} onClick={() => control('submit')}>
                Submit for approval
              </button>
              {onEdit ? (
                <button type="button" className="btn-outline text-xs" onClick={onEdit}>
                  Edit definition
                </button>
              ) : null}
            </>
          ) : null}
          {can('approve') ? (
            <>
              <input className="input-field" aria-label="Approval note" placeholder="Note" value={note} onChange={(event) => setNote(event.target.value)} />
              <button type="button" className="btn-primary text-xs" disabled={state.busy} onClick={() => control('approve', { note })}>
                Approve
              </button>
              <button type="button" className="btn-outline text-xs" disabled={state.busy} onClick={() => control('reject', { note })}>
                Reject
              </button>
            </>
          ) : null}
          {can('start') ? (
            <>
              <label className="text-sm flex flex-col gap-1">
                <span className="input-label">Type “{experiment.definition.name}” to confirm</span>
                <input className="input-field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
              </label>
              <button
                type="button"
                className="btn-danger text-xs"
                disabled={state.busy || confirmation.trim() !== experiment.definition.name}
                onClick={() => control('start', { confirmation })}
              >
                Start experiment
              </button>
            </>
          ) : null}
          {can('stop') ? (
            <button type="button" className="btn-outline text-xs" disabled={state.busy} onClick={() => control('stop', { reason: 'Stopped early by operator.' })}>
              Stop (graceful)
            </button>
          ) : null}
        </div>

        {can('abort') ? (
          <div className="flex flex-wrap items-end gap-2 rounded border border-red-500 p-2 mt-1">
            <label className="text-sm flex flex-col gap-1 flex-1">
              <span className="input-label">Abort reason (required)</span>
              <input className="input-field" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="button" className="btn-danger" disabled={state.busy || !reason.trim()} onClick={() => control('abort', { reason })}>
              ■ Abort now
            </button>
          </div>
        ) : null}
      </section>

      {state.failedPreflight ? <GuardrailsPanel result={state.failedPreflight} title="Why the action was refused" /> : <GuardrailsPanel result={detail.preflight} />}

      {samples.length > 0 ? (
        <section className="card card-padding" aria-label="Live metrics">
          <h2 className="text-sm-semibold mb-2">
            Live metrics <span className="text-meta">· +{elapsed} s · {last?.affectedRuns ?? 0} runs affected · {last?.injectedFaults ?? 0} faults injected</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SERIES.map((series) => {
              const rule = series.metric ? experiment.definition.haltRules.find((candidate) => candidate.metric === series.metric) : undefined;
              const value = last ? Number(last[series.key]) : 0;
              const breaching = rule && last ? (rule.comparator === 'gt' ? metricValue(last, rule.metric) > rule.threshold : metricValue(last, rule.metric) < rule.threshold) : false;
              return (
                <li key={series.key} className="flex flex-col gap-1">
                  <span className="text-sm">
                    {series.label}: <strong className={breaching ? 'field-error' : undefined}>{series.format(value)}</strong>
                    {rule ? <span className="text-meta text-xs"> · halt {rule.comparator === 'gt' ? '>' : '<'} {series.format(rule.threshold)}</span> : null}
                  </span>
                  <Sparkline samples={samples} seriesKey={series.key} threshold={rule?.threshold} />
                </li>
              );
            })}
          </ul>
          {last?.incidentOpened ? (
            <p className="field-error text-sm mt-2" role="alert">
              Incident trigger fired (sustained error rate above 25%).
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card card-padding" aria-label="Audit trail">
        <h2 className="text-sm-semibold">Audit trail</h2>
        <ol className="text-xs flex flex-col gap-1 mt-1">
          {experiment.events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <time dateTime={event.at}>{event.at.slice(0, 19).replace('T', ' ')}</time> · {event.actor} · <code>{event.action}</code> — {event.detail}
            </li>
          ))}
        </ol>
        <p className="text-meta text-xs mt-1">Versions: {experiment.versions.map((version) => `v${version.version} ${version.fingerprint.slice(0, 8)}`).join(', ')}</p>
      </section>
    </div>
  );
}
