/**
 * GET /api/filters/suggestions?field=X (#2194)
 *
 * Returns distinct values for a given field, used for value autocomplete
 * in the query builder UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { FIELD_MAP } from '@/features/dashboard/filters/ast/FilterAST';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const field = url.searchParams.get('field');

  if (!field) {
    return NextResponse.json({ error: 'Missing field parameter' }, { status: 400 });
  }

  // If the field has enum values defined in the schema, return those.
  const fieldDef = FIELD_MAP[field];
  if (fieldDef?.enumValues) {
    return NextResponse.json({ values: fieldDef.enumValues });
  }

  // Otherwise, collect distinct values from the data.
  const allRuns = buildMockRuns();
  const values = new Set<string>();
  for (const run of allRuns) {
    const value = (run as unknown as Record<string, unknown>)[field];
    if (value !== undefined && value !== null) {
      values.add(String(value));
    }
  }

  return NextResponse.json({ values: Array.from(values).sort() });
}
