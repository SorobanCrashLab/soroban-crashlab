import type { Metadata } from 'next';
import { MutationStrategyLab } from '@/features/strategy-lab/MutationStrategyLab';
import type { Experiment, Strategy } from '@/features/strategy-lab/model';

export const metadata: Metadata = {
  title: 'Mutation strategy lab | Soroban CrashLab',
  description: 'Design, compare and safely roll out fuzzing mutation strategies.',
};
export const dynamic = 'force-dynamic';

const strategies: Strategy[] = [
  {
    id: 'balanced', name: 'Balanced', version: 1, schedule: 'fixed',
    constraints: { maxInputBytes: 4096, maxMutatorsPerCase: 3 },
    tags: ['baseline'],
    mutators: [
      { id: 'bitflip', kind: 'bitflip', weight: 60, enabled: true },
      { id: 'slice', kind: 'slice', weight: 30, enabled: true },
      { id: 'dictionary', kind: 'dictionary', weight: 10, enabled: true },
    ],
  },
  {
    id: 'structure-aware', name: 'Structure aware', version: 2, schedule: 'adaptive',
    constraints: { maxInputBytes: 8192, maxMutatorsPerCase: 4 },
    tags: ['candidate'],
    mutators: [
      { id: 'bitflip', kind: 'bitflip', weight: 25, enabled: true },
      { id: 'structure', kind: 'structure', weight: 55, enabled: true },
      { id: 'crossover', kind: 'crossover', weight: 20, enabled: true },
    ],
  },
];

const experiments: Experiment[] = [
  {
    id: 'exp-1', baselineId: 'balanced', candidateId: 'structure-aware',
    baseline: { coveragePct: 61, uniqueCrashes: 5, timeToFirstCrashSec: 140, execPerSec: 850, costUsd: 12 },
    candidate: { coveragePct: 68, uniqueCrashes: 9, timeToFirstCrashSec: 95, execPerSec: 910, costUsd: 14 },
    createdAt: '2026-01-05T00:00:00Z',
  },
];

export default function StrategiesPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 id="strategy-lab-heading" className="heading-page">Mutation strategy lab</h1>
      <p className="text-meta mt-1 mb-6 max-w-3xl">
        Versioned presets, A/B experiment outcomes, recommendations and rollout guardrails for fuzz strategies.
      </p>
      <MutationStrategyLab strategies={strategies} experiments={experiments} />
    </div>
  );
}
