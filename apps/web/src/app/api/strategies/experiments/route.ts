/**
 * /api/strategies/experiments — A/B experiments for the Mutation Strategy Lab (#2328).
 *
 * GET  list experiments with computed deltas, recommendations and rollout guard.
 * POST register an experiment result.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  compareExperiments,
  evaluateRolloutGuard,
  recommend,
  type Experiment,
  type Strategy,
} from '@/features/strategy-lab/model';

export const dynamic = 'force-dynamic';

const store: { experiments: Experiment[]; strategies: Map<string, Strategy> } = {
  experiments: [],
  strategies: new Map(),
};

export async function GET(request: NextRequest) {
  const approvals = Number(request.nextUrl.searchParams.get('approvals') ?? 0);
  const requiredApprovals = Number(request.nextUrl.searchParams.get('requiredApprovals') ?? 2);
  const canApply = request.nextUrl.searchParams.get('canApply') === 'true';
  return NextResponse.json({
    experiments: store.experiments.map((experiment) => ({
      ...experiment,
      deltas: compareExperiments(experiment),
      recommendations: recommend(experiment, store.strategies.get(experiment.candidateId) ?? {
        id: experiment.candidateId, name: 'unknown', version: 1, schedule: 'fixed',
        constraints: { maxInputBytes: 0, maxMutatorsPerCase: 0 }, tags: [], mutators: [],
      }),
      rollout: evaluateRolloutGuard(
        store.strategies.get(experiment.candidateId) ?? {
          id: experiment.candidateId, name: 'unknown', version: 1, schedule: 'fixed',
          constraints: { maxInputBytes: 0, maxMutatorsPerCase: 0 }, tags: [], mutators: [],
        },
        experiment,
        { approvals, requiredApprovals, canApply },
      ),
    })),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    experiment?: Experiment; candidate?: Strategy;
  } | null;
  if (!body?.experiment) {
    return NextResponse.json({ error: 'experiment is required' }, { status: 400 });
  }
  store.experiments.push(body.experiment);
  if (body.candidate) store.strategies.set(body.candidate.id, body.candidate);
  return NextResponse.json({ experiment: body.experiment }, { status: 201 });
}
