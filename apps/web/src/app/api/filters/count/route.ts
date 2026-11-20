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
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

export const dynamic = 'force-dynamic';

async function postHandler(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request);
    if ('error' in parsed) return parsed.error;
    const body = parsed.body as { ast?: FilterAST };
    const ast = body.ast;

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

// Shared wrapper bounds and streams the body with the standardized 413/408 envelopes.
export const POST = withRouteErrorHandling('POST /api/filters/count', postHandler);
