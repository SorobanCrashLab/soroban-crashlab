/*
 * Mutation Strategy Lab (#2328).
 *
 * Deterministic model for strategy pipelines, versioned presets, A/B
 * experiments and rollout guardrails. No I/O or React dependencies.
 */

export type MutatorKind = 'bitflip' | 'slice' | 'arithmetic' | 'dictionary' | 'crossover' | 'structure';
export type Schedule = 'fixed' | 'adaptive' | 'round-robin';

export interface Mutator {
  id: string;
  kind: MutatorKind;
  weight: number;
  enabled: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  version: number;
  mutators: Mutator[];
  schedule: Schedule;
  constraints: { maxInputBytes: number; maxMutatorsPerCase: number };
  tags: string[];
}

export interface Metrics {
  coveragePct: number;
  uniqueCrashes: number;
  timeToFirstCrashSec: number | null;
  execPerSec: number;
  costUsd: number;
}

export interface Experiment {
  id: string;
  baselineId: string;
  candidateId: string;
  baseline: Metrics;
  candidate: Metrics;
  createdAt: string;
}

export interface StrategyDiffRow {
  field: string;
  before: string;
  after: string;
}

export interface Recommendation {
  kind: 'starving-mutator' | 'diminishing-returns' | 'cost-regression' | 'improvement';
  detail: string;
  severity: 'info' | 'warning';
}

export interface RolloutDecision {
  approved: boolean;
  reasons: string[];
}

export function validateStrategy(strategy: Strategy): string[] {
  const errors: string[] = [];
  const enabled = strategy.mutators.filter((mutator) => mutator.enabled);
  if (enabled.length === 0) errors.push('At least one mutator must be enabled');
  if (enabled.some((mutator) => mutator.weight < 0)) errors.push('Mutator weights must be non-negative');
  const total = enabled.reduce((sum, mutator) => sum + mutator.weight, 0);
  if (total <= 0) errors.push('Enabled mutator weights must sum to more than zero');
  if (strategy.constraints.maxInputBytes <= 0) errors.push('maxInputBytes must be positive');
  if (strategy.constraints.maxMutatorsPerCase < 1) errors.push('maxMutatorsPerCase must be at least 1');
  if (strategy.version < 1) errors.push('Version must be at least 1');
  return errors;
}

/** Normalise enabled mutator weights to sum to 100, keeping relative ratios. */
export function normalizeWeights(mutators: Mutator[]): Mutator[] {
  const enabled = mutators.filter((mutator) => mutator.enabled);
  const total = enabled.reduce((sum, mutator) => sum + mutator.weight, 0);
  return mutators.map((mutator) => {
    if (!mutator.enabled || total <= 0) return mutator;
    return { ...mutator, weight: Math.round((mutator.weight / total) * 1000) / 10 };
  });
}

/** Canonical, deterministic serialisation for reproducibility and diffing. */
export function serializeStrategy(strategy: Strategy): string {
  const canonical = {
    id: strategy.id,
    name: strategy.name,
    version: strategy.version,
    schedule: strategy.schedule,
    constraints: strategy.constraints,
    tags: [...strategy.tags].sort(),
    mutators: [...strategy.mutators]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((mutator) => ({ ...mutator })),
  };
  return JSON.stringify(canonical);
}

export function diffStrategies(before: Strategy, after: Strategy): StrategyDiffRow[] {
  const rows: StrategyDiffRow[] = [];
  if (before.name !== after.name) rows.push({ field: 'name', before: before.name, after: after.name });
  if (before.version !== after.version) rows.push({ field: 'version', before: String(before.version), after: String(after.version) });
  if (before.schedule !== after.schedule) rows.push({ field: 'schedule', before: before.schedule, after: after.schedule });
  const beforeMutators = new Map(before.mutators.map((m) => [m.id, m]));
  const afterMutators = new Map(after.mutators.map((m) => [m.id, m]));
  for (const id of [...new Set([...beforeMutators.keys(), ...afterMutators.keys()])].sort()) {
    const oldM = beforeMutators.get(id);
    const newM = afterMutators.get(id);
    if (!oldM) rows.push({ field: `mutator.${id}`, before: '-', after: JSON.stringify(newM) });
    else if (!newM) rows.push({ field: `mutator.${id}`, before: JSON.stringify(oldM), after: '-' });
    else {
      const canonical = (mutator: Mutator) => JSON.stringify([
        mutator.id, mutator.kind, mutator.weight, mutator.enabled,
      ]);
      if (canonical(oldM) !== canonical(newM)) {
        rows.push({ field: `mutator.${id}`, before: JSON.stringify(oldM), after: JSON.stringify(newM) });
      }
    }
  }
  return rows;
}

/** Delta metrics and derived yield/cost metrics for an A/B experiment. */
export function compareExperiments(experiment: Experiment) {
  const { baseline: b, candidate: c } = experiment;
  return {
    coverageDelta: Math.round((c.coveragePct - b.coveragePct) * 100) / 100,
    uniqueCrashesDelta: c.uniqueCrashes - b.uniqueCrashes,
    execPerSecDelta: Math.round((c.execPerSec - b.execPerSec) * 100) / 100,
    costDelta: Math.round((c.costUsd - b.costUsd) * 100) / 100,
    crashesPerDollar: c.costUsd > 0 ? Math.round((c.uniqueCrashes / c.costUsd) * 100) / 100 : 0,
    timeToFirstCrashDelta:
      b.timeToFirstCrashSec !== null && c.timeToFirstCrashSec !== null
        ? Math.round((c.timeToFirstCrashSec - b.timeToFirstCrashSec) * 100) / 100
        : null,
  };
}

export function recommend(experiment: Experiment, strategy: Strategy): Recommendation[] {
  const result: Recommendation[] = [];
  const delta = compareExperiments(experiment);
  const starving = strategy.mutators.filter((mutator) => mutator.enabled && mutator.weight < 5);
  for (const mutator of starving) {
    result.push({
      kind: 'starving-mutator',
      detail: `${mutator.kind} has ${mutator.weight}% weight and is effectively unused`,
      severity: 'warning',
    });
  }
  if (delta.coverageDelta > 0 && delta.uniqueCrashesDelta <= 0) {
    result.push({
      kind: 'diminishing-returns',
      detail: `coverage rose ${delta.coverageDelta}% with no new crashes`,
      severity: 'info',
    });
  }
  if (delta.costDelta > 0 && delta.uniqueCrashesDelta <= 0) {
    result.push({
      kind: 'cost-regression',
      detail: `cost rose $${delta.costDelta} without additional crashes`,
      severity: 'warning',
    });
  }
  if (delta.uniqueCrashesDelta > 0) {
    result.push({
      kind: 'improvement',
      detail: `${delta.uniqueCrashesDelta} additional unique crashes`,
      severity: 'info',
    });
  }
  return result.sort((a, b) => a.kind.localeCompare(b.kind));
}

/** Guardrails before a strategy may be applied to a shared campaign. */
export function evaluateRolloutGuard(
  strategy: Strategy,
  experiment: Experiment,
  options: { approvals: number; requiredApprovals: number; canApply: boolean },
): RolloutDecision {
  const reasons: string[] = [];
  const errors = validateStrategy(strategy);
  reasons.push(...errors);
  const delta = compareExperiments(experiment);
  if (delta.uniqueCrashesDelta < 0) reasons.push('Candidate discovers fewer crashes than baseline');
  if (delta.costDelta > 0 && delta.uniqueCrashesDelta <= 0) reasons.push('Cost regression without crash gain');
  if (options.approvals < options.requiredApprovals) reasons.push('Required approvals not met');
  if (!options.canApply) reasons.push('Caller lacks permission to apply strategies to this campaign');
  return { approved: reasons.length === 0, reasons };
}
