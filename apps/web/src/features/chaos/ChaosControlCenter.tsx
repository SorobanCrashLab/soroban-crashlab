'use client';

/**
 * Chaos & Failure Injection Control Center (#2340): experiment list, a
 * global emergency stop, the designer, and the live monitor / analysis for
 * the selected experiment.
 */

import { useState } from 'react';
import { ExperimentAnalysis } from './ExperimentAnalysis';
import { BLANK_DEFINITION, ExperimentDesigner } from './ExperimentDesigner';
import { LiveExperimentMonitor } from './LiveExperimentMonitor';
import { useChaosExperiments } from './hooks/useChaosExperiments';

const STATUS_TONE: Record<string, string> = {
  running: 'ds-badge-warning',
  halted: 'ds-badge-error',
  aborted: 'ds-badge-error',
  completed: 'ds-badge-success',
  approved: 'ds-badge-info',
  'pending-approval': 'ds-badge-info',
};

export function ChaosControlCenter() {
  const state = useChaosExperiments();
  const [mode, setMode] = useState<'monitor' | 'design' | 'edit'>('monitor');
  const [stopReason, setStopReason] = useState('');
  const experiments = state.list?.experiments ?? [];
  const active = experiments.filter((experiment) => ['running', 'approved', 'pending-approval'].includes(experiment.status));
  const canControl = Boolean(state.viewer && state.viewer.role !== 'anonymous');

  return (
    <div className="container-full page-padding fade-in flex flex-col gap-4">
      <header className="flex-between flex-wrap gap-3">
        <div>
          <h1 className="heading-page">Chaos &amp; failure injection</h1>
          <p className="text-meta mt-1">
            Design guarded experiments, run them with approvals and automatic halt rules, and analyse the impact.
            {state.list?.executor === 'simulated' ? ' Executor: simulated (no real traffic is altered).' : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!canControl}
          onClick={() => {
            state.select(null);
            setMode('design');
          }}
        >
          New experiment
        </button>
      </header>

      {canControl && active.length > 0 ? (
        <section className="card card-padding flex flex-wrap items-end gap-2 border border-red-500" aria-label="Emergency stop">
          <p className="text-sm-semibold w-full">
            {active.length} active experiment(s): {active.map((experiment) => experiment.name).join(', ')}
          </p>
          <label className="text-sm flex flex-col gap-1 flex-1">
            <span className="input-label">Emergency stop reason</span>
            <input className="input-field" value={stopReason} onChange={(event) => setStopReason(event.target.value)} />
          </label>
          <button
            type="button"
            className="btn-danger"
            disabled={state.busy || !stopReason.trim()}
            onClick={() => {
              void state.abortAll(stopReason);
              setStopReason('');
            }}
          >
            ■ Abort all active experiments
          </button>
        </section>
      ) : null}

      {state.notice ? (
        <p className={state.notice.kind === 'error' ? 'field-error text-sm' : 'text-sm'} role={state.notice.kind === 'error' ? 'alert' : 'status'}>
          {state.notice.text}{' '}
          <button type="button" className="btn-ghost text-xs" onClick={state.dismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="card card-padding min-w-0" aria-label="Experiments" aria-busy={state.listLoading}>
          <h2 className="text-sm-semibold mb-2">Experiments</h2>
          {state.listError ? <p className="field-error text-sm">{state.listError}</p> : null}
          <ul className="flex flex-col gap-1">
            {experiments.map((experiment) => (
              <li key={experiment.id}>
                <button
                  type="button"
                  className={`w-full text-left rounded px-2 py-1 ${state.selectedId === experiment.id ? 'surface-soft' : ''}`}
                  aria-current={state.selectedId === experiment.id ? 'true' : undefined}
                  onClick={() => {
                    state.select(experiment.id);
                    setMode('monitor');
                  }}
                >
                  <span className="flex-between gap-2">
                    <span className="text-sm truncate">{experiment.name}</span>
                    <span className={`ds-badge ${STATUS_TONE[experiment.status] ?? 'ds-badge-neutral'}`}>{experiment.status}</span>
                  </span>
                  <span className="text-meta text-xs">
                    {experiment.id} · v{experiment.version} · {experiment.targets.map((target) => target.id).join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {state.list ? (
            <details className="mt-3">
              <summary className="text-sm cursor-pointer">Maintenance windows</summary>
              <ul className="text-xs mt-1">
                {state.list.maintenanceWindows.map((window) => (
                  <li key={window.environment}>{window.label}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <div className="min-w-0">
          {mode === 'design' ? <ExperimentDesigner key="new" state={state} initial={BLANK_DEFINITION} onSaved={() => setMode('monitor')} /> : null}
          {mode === 'edit' && state.detail ? (
            <ExperimentDesigner
              key={`${state.detail.experiment.id}-v${state.detail.experiment.version}`}
              state={state}
              initial={state.detail.experiment.definition}
              experimentId={state.detail.experiment.id}
              onSaved={() => setMode('monitor')}
            />
          ) : null}
          {mode === 'monitor' && state.selectedId ? (
            state.detail ? (
              <div className="flex flex-col gap-4">
                <LiveExperimentMonitor
                  state={state}
                  detail={state.detail}
                  onEdit={['draft', 'rejected'].includes(state.detail.experiment.status) ? () => setMode('edit') : undefined}
                />
                {state.detail.analysis && state.detail.experiment.status !== 'running' ? <ExperimentAnalysis analysis={state.detail.analysis} /> : null}
              </div>
            ) : (
              <p className="text-meta">{state.detailError ?? 'Loading experiment…'}</p>
            )
          ) : null}
          {mode === 'monitor' && !state.selectedId ? (
            <section className="card card-padding">
              <p className="text-meta">Select an experiment, or create one from a template. Nothing runs without approval, a passing preflight and typed confirmation.</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
