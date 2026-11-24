'use client';

/**
 * Guardrails & preflight (#2340): blast radius, environments, concurrency,
 * overlap, maintenance windows, halt rules and approvals — each with a
 * pass/warn/fail status that is spelled out, not only colour-coded.
 */

import type { PreflightResult } from './lib/guardrails';

const STATUS = {
  pass: { icon: '✓', tone: 'ds-badge-success', label: 'pass' },
  warn: { icon: '!', tone: 'ds-badge-warning', label: 'warning' },
  fail: { icon: '✕', tone: 'ds-badge-error', label: 'blocking' },
} as const;

export function GuardrailsPanel({ result, title = 'Preflight & guardrails' }: { result: PreflightResult | null; title?: string }) {
  if (!result) {
    return (
      <section className="card card-padding" aria-label={title}>
        <h2 className="text-sm-semibold">{title}</h2>
        <p className="text-meta text-sm">Run a dry run to see impact and preflight checks.</p>
      </section>
    );
  }
  const { impact } = result;
  return (
    <section className="card card-padding flex flex-col gap-3" aria-label={title}>
      <div className="flex-between flex-wrap gap-2">
        <h2 className="text-sm-semibold">{title}</h2>
        <span className={`ds-badge ${result.readyToStart ? 'ds-badge-success' : result.readyToSubmit ? 'ds-badge-warning' : 'ds-badge-error'}`}>
          {result.readyToStart ? 'Ready to start' : result.readyToSubmit ? 'Ready to submit' : 'Blocked'}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="stat-card">
          <dt className="stat-label">Blast radius</dt>
          <dd className="text-sm-semibold">{impact.blastRadiusPct}%</dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Runs affected / h</dt>
          <dd className="text-sm-semibold">{impact.affectedPerHour.toLocaleString('en-US')}</dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Error rate Δ</dt>
          <dd className="text-sm-semibold">+{(impact.expectedErrorRateDelta * 100).toFixed(1)}%</dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Latency Δ</dt>
          <dd className="text-sm-semibold">+{impact.expectedLatencyDeltaMs} ms</dd>
        </div>
      </dl>
      <p className="text-meta text-xs">
        Targets: {impact.targets.map((target) => `${target.label} (${target.environment})`).join(', ') || 'none'}
        {impact.dependents.length > 0 ? ` · dependents: ${impact.dependents.join(', ')}` : ''}
      </p>
      <ul className="flex flex-col gap-1">
        {result.checks.map((check) => (
          <li key={check.id} className="text-sm flex gap-2 items-start">
            <span className={`ds-badge ${STATUS[check.status].tone}`} aria-label={STATUS[check.status].label}>
              {STATUS[check.status].icon}
            </span>
            <span>
              <strong>{check.label}</strong> — {check.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
