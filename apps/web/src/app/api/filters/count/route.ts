/**
 * POST /api/filters/count (#2194)
 *
 * Returns the total count of runs matching the provided filter AST.
 * Used for the real-time count display in the query builder.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { countMatches } from '@/features/dashboard/filters/ast/visitors';
import type { FilterAST } from '@/features/dashboard/filters/ast/FilterAST';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ast = body.ast as FilterAST;

    if (!ast || typeof ast !== 'object' || ast.type !== 'group') {
      return NextResponse.json({ error: 'Invalid filter AST' }, { status: 400 });
    }

    const allRuns = buildMockRuns();
    const count = countMatches(allRuns, ast);

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
