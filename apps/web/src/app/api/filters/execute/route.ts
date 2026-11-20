/**
 * POST /api/filters/execute (#2194)
 *
 * Executes a filter AST against all runs and returns matching runs
 * plus the total count. Server-side execution is used for datasets
 * exceeding the client threshold (50k rows).
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { evaluate } from '@/features/dashboard/filters/ast/visitors';
import type { FilterAST } from '@/features/dashboard/filters/ast/FilterAST';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ast = body.ast as FilterAST;
    const limit = typeof body.limit === 'number' ? Math.min(body.limit, 1000) : 100;

    if (!ast || typeof ast !== 'object' || ast.type !== 'group') {
      return NextResponse.json({ error: 'Invalid filter AST' }, { status: 400 });
    }

    const allRuns = buildMockRuns();
    const matching = allRuns.filter((run) => evaluate(ast, run));
    const paginated = matching.slice(0, limit);

    return NextResponse.json({
      count: matching.length,
      runs: paginated,
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
