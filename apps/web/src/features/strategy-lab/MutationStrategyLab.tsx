'use client';

/*
 * Mutation Strategy Lab UI (#2328).
 *
 * Editor for mutator weights, a versioned preset list, and an experiment A/B
 * comparison with metrics, recommendations and rollout guardrails.
 */
import { useMemo, useState } from 'react';
import {
  compareExperiments,
  diffStrategies,
  evaluateRolloutGuard,
  normalizeWeights,
  recommend,
  serializeStrategy,
  validateStrategy,
  type Experiment,
  type Strategy,
} from './model';

interface MutationStrategyLabProps {
  strategies: Strategy[];
  experiments: Experiment[];
  canApply?: boolean;
  requiredApprovals?: number;
}

export function MutationStrategyLab({
  strategies,
  experiments,
  canApply = false,
  requiredApprovals = 2,
}: MutationStrategyLabProps) {
  const [selectedId, setSelectedId] = useState(strategies[0]?.id ?? '');
  const [experimentId, setExperimentId] = useState(experiments[0]?.id ?? '');
  const [approvals, setApprovals] = useState(0);

  const strategy = strategies.find((item) => item.id === selectedId) ?? strategies[0];
  const experiment = experiments.find((item) => item.id === experimentId) ?? experiments[0];
  const [draft, setDraft] = useState<Strategy | undefined>(strategy);
  const active = draft && draft.id === strategy?.id ? draft : strategy;

  const delta = useMemo(() => (experiment ? compareExperiments(experiment) : null), [experiment]);
  const suggestions = useMemo(
    () => (experiment && active ? recommend(experiment, active) : []),
    [experiment, active],
  );
  const rollout = useMemo(
    () => (experiment && active
      ? evaluateRolloutGuard(active, experiment, { approvals, requiredApprovals, canApply })
      : null),
    [experiment, active, approvals, requiredApprovals, canApply],
  );
  const changes = useMemo(
    () => (strategy && active ? diffStrategies(strategy, active) : []),
    [strategy, active],
  );

  if (!active) return <p className="text-meta">No strategy presets are available.</p>;

  const updateWeight = (id: string, weight: number) => {
    setDraft({
      ...active,
      mutators: active.mutators.map((mutator) =>
        mutator.id === id ? { ...mutator, weight } : mutator),
    });
  };

  return (
    <section aria-labelledby="strategy-lab-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="strategy-preset">Preset</label>
        <select
          id="strategy-preset"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setDraft(undefined);
          }}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
        >
          {strategies.map((item) => (
            <option key={item.id} value={item.id}>{item.name} v{item.version}</option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-1"
          onClick={() => {
            const normalized = normalizeWeights(active.mutators);
            setDraft({ ...active, mutators: normalized, version: active.version + 1 });
          }}
        >
          Normalize &amp; bump version
        </button>
        <span className="text-xs text-slate-400" title="Canonical serialized strategy">
          {serializeStrategy(active).length} bytes canonical
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="heading-section">Mutator pipeline</h2>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Mutator weights for {active.name}</caption>
            <thead><tr><th scope="col">Mutator</th><th scope="col">Weight %</th><th scope="col">Enabled</th></tr></thead>
            <tbody>
              {active.mutators.map((mutator) => (
                <tr key={mutator.id} className="border-b border-slate-800">
                  <td className="font-mono">{mutator.kind}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`${mutator.kind} weight`}
                      value={mutator.weight}
                      onChange={(event) => updateWeight(mutator.id, Number(event.target.value))}
                      className="w-20 rounded border border-slate-700 bg-slate-900 px-1"
                    />
                  </td>
                  <td>{mutator.enabled ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 text-sm text-amber-300" aria-live="polite">
            {validateStrategy(active).map((error) => <li key={error}>{error}</li>)}
          </ul>
          {changes.length > 0 && (
            <p className="text-meta">Pending edits: {changes.map((change) => change.field).join(', ')}</p>
          )}
        </div>

        <div>
          <h2 className="heading-section">Experiment comparison</h2>
          <label htmlFor="strategy-experiment">Experiment</label>
          <select
            id="strategy-experiment"
            value={experimentId}
            onChange={(event) => setExperimentId(event.target.value)}
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1"
          >
            {experiments.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
          </select>
          {delta && (
            <table className="mt-2 w-full text-left text-sm">
              <caption className="sr-only">Baseline versus candidate deltas</caption>
              <thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Candidate</th><th scope="col">Delta</th></tr></thead>
              <tbody>
                <tr><td>Coverage %</td><td>{experiment?.baseline.coveragePct}</td><td>{experiment?.candidate.coveragePct}</td><td>{delta.coverageDelta}</td></tr>
                <tr><td>Unique crashes</td><td>{experiment?.baseline.uniqueCrashes}</td><td>{experiment?.candidate.uniqueCrashes}</td><td>{delta.uniqueCrashesDelta}</td></tr>
                <tr><td>Exec/sec</td><td>{experiment?.baseline.execPerSec}</td><td>{experiment?.candidate.execPerSec}</td><td>{delta.execPerSecDelta}</td></tr>
                <tr><td>Cost USD</td><td>{experiment?.baseline.costUsd}</td><td>{experiment?.candidate.costUsd}</td><td>{delta.costDelta}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h2 className="heading-section">Recommendations</h2>
        <ul className="space-y-1 text-sm">
          {suggestions.map(( suggestion) => (
            <li key={`${suggestion.kind}-${suggestion.detail}`}>{suggestion.severity}: {suggestion.detail}</li>
          ))}
          {suggestions.length === 0 && <li className="text-meta">No recommendations.</li>}
        </ul>
      </div>

      <div>
        <h2 className="heading-section">Rollout guardrail</h2>
        <label htmlFor="strategy-approvals">Approvals</label>
        <input
          id="strategy-approvals"
          type="number"
          min={0}
          value={approvals}
          onChange={(event) => setApprovals(Number(event.target.value))}
          className="ml-2 w-20 rounded border border-slate-700 bg-slate-900 px-1"
        />
        <p className="mt-2 text-sm" role="status">
          {rollout?.approved ? 'Guardrail passed — strategy may be applied.' : `Blocked: ${rollout?.reasons.join('; ')}`}
        </p>
      </div>
    </section>
  );
}
