import type { Metadata } from 'next';
import { RegressionMatrix } from '@/features/regression-matrix/RegressionMatrix';
import type { RunOutcome } from '@/features/regression-matrix/model';

export const metadata: Metadata = {
  title: 'Regression & compatibility matrix | Soroban CrashLab',
  description: 'Cross-version, cross-environment and cross-target outcome analysis.',
};
export const dynamic = 'force-dynamic';

function outcome(id: string, version: string, environment: string, status: RunOutcome['status'], crashRate: number): RunOutcome {
  return {
    id,
    axes: { version, environment, target: 'wasm', runner: 'ci', seedSet: 's1' },
    status,
    crashRate,
    signatureIds: crashRate > 0 ? ['SIG-7'] : [],
    durationMs: 1200,
  };
}

const runs: RunOutcome[] = [
  outcome('r1', 'v1', 'testnet', 'pass', 0),
  outcome('r2', 'v1', 'mainnet', 'pass', 0),
  outcome('r3', 'v2', 'testnet', 'crash', 0.6),
  outcome('r4', 'v2', 'mainnet', 'pass', 0),
];

const baselines: RunOutcome[] = [
  outcome('b1', 'v1', 'testnet', 'pass', 0),
  outcome('b2', 'v1', 'mainnet', 'pass', 0),
  outcome('b3', 'v2', 'testnet', 'pass', 0.1),
  outcome('b4', 'v2', 'mainnet', 'pass', 0),
];

export default function RegressionMatrixPage() {
  return (
    <div className="container-full page-padding fade-in">
      <h1 id="regression-matrix-heading" className="heading-page">Regression &amp; compatibility matrix</h1>
      <p className="text-meta mt-1 mb-6 max-w-3xl">
        Multi-dimensional pass/fail/crash outcomes with baseline regression highlights, flake overlays and CSV export.
      </p>
      <RegressionMatrix runs={runs} baselines={baselines} />
    </div>
  );
}
