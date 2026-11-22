/**
 * /api/strategies — Mutation Strategy Lab (#2328).
 *
 * GET   list versioned strategy presets (or one by id) with validation results.
 * POST  create a preset, or compute a deterministic diff between two presets.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  diffStrategies,
  serializeStrategy,
  validateStrategy,
  type Strategy,
} from '@/features/strategy-lab/model';

export const dynamic = 'force-dynamic';

const store: { strategies: Strategy[] } = {
  strategies: [{
    id: 'balanced', name: 'Balanced', version: 1, schedule: 'fixed',
    constraints: { maxInputBytes: 4096, maxMutatorsPerCase: 3 }, tags: ['baseline'],
    mutators: [
      { id: 'bitflip', kind: 'bitflip', weight: 60, enabled: true },
      { id: 'slice', kind: 'slice', weight: 40, enabled: true },
    ],
  }],
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const strategies = id ? store.strategies.filter((item) => item.id === id) : store.strategies;
  return NextResponse.json({
    strategies: strategies.map((strategy) => ({
      ...strategy,
      errors: validateStrategy(strategy),
      canonical: serializeStrategy(strategy),
    })),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    kind?: string; strategy?: Strategy; leftId?: string; rightId?: string;
  } | null;

  if (body?.kind === 'diff') {
    const left = store.strategies.find((item) => item.id === body.leftId);
    const right = store.strategies.find((item) => item.id === body.rightId);
    if (!left || !right) return NextResponse.json({ error: 'Unknown preset id' }, { status: 404 });
    return NextResponse.json({ diff: diffStrategies(left, right) });
  }

  if (!body?.strategy) {
    return NextResponse.json({ error: 'strategy is required' }, { status: 400 });
  }
  const errors = validateStrategy(body.strategy);
  if (errors.length > 0) return NextResponse.json({ errors }, { status: 422 });

  const existingIndex = store.strategies.findIndex((item) => item.id === body.strategy!.id);
  if (existingIndex >= 0) {
    if (store.strategies[existingIndex].version >= body.strategy.version) {
      return NextResponse.json({ error: 'Version must be bumped on re-registration' }, { status: 409 });
    }
    store.strategies[existingIndex] = body.strategy;
  } else {
    store.strategies.push(body.strategy);
  }
  return NextResponse.json({ strategy: body.strategy }, { status: 201 });
}
