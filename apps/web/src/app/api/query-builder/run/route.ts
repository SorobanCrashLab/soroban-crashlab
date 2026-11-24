import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { checkRbacPermission, describePrincipal } from '@/lib/rbac';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { loadDatasets } from '@/features/query-builder/adapters';
import { executeQuery } from '@/features/query-builder/lib/engine';
import { explainQuery, type DatasetStats } from '@/features/query-builder/lib/explain';
import { entitiesInQuery } from '@/features/query-builder/lib/model';
import { parseQueryJson, toDsl } from '@/features/query-builder/lib/serialize';
import { bindParams, validateQuery, type ViewerRole } from '@/features/query-builder/lib/validate';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    query: z.unknown(),
    params: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
    mode: z.enum(['run', 'explain']).default('run'),
  })
  .strict();

/**
 * POST /api/query-builder/run (#2339)
 *
 * Executes a visual query against the server-side dataset adapters. The
 * query arrives in canonical JSON form and is re-parsed, re-validated and
 * re-bound here with the caller's resolved role, so a crafted client cannot
 * filter on or read restricted fields. `mode: "explain"` returns the plan,
 * cost estimate and DSL without executing.
 */
export const POST = withRouteErrorHandling(
  'POST /api/query-builder/run',
  async (request: NextRequest) => {
    const denial = await checkRbacPermission(request);
    if (denial) return denial;
    const { principal, role } = await describePrincipal(request);
    const viewerRole: ViewerRole = !principal.authenticated
      ? 'anonymous'
      : role === 'maintainer'
        ? 'maintainer'
        : 'analyst';

    const read = await readJsonBody(request);
    if ('error' in read) return read.error;
    const body = bodySchema.safeParse(read.body);
    if (!body.success) {
      return errorResponse(`Invalid request: ${body.error.issues.map((issue) => issue.message).join('; ')}`, 400);
    }

    const parsed = parseQueryJson(body.data.query);
    if (!parsed.ok) return errorResponse(`Invalid query: ${parsed.errors.join('; ')}`, 422);

    const validation = validateQuery(parsed.query, viewerRole);
    if (!validation.valid) {
      return errorResponse(`Invalid query: ${validation.errors.map((issue) => issue.message).join('; ')}`, 422);
    }

    const { datasets, warnings: adapterWarnings } = await loadDatasets(entitiesInQuery(parsed.query));
    const stats: DatasetStats = Object.fromEntries(
      Object.entries(datasets).map(([entity, rows]) => [entity, { rows: rows?.length ?? 0 }]),
    );
    const explain = explainQuery(parsed.query, stats);
    const viewer = { role: viewerRole, subject: principal.subject };

    if (body.data.mode === 'explain') {
      const response = successResponse({ viewer, explain, dsl: toDsl(parsed.query), stats, warnings: adapterWarnings });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const bound = bindParams(parsed.query, body.data.params ?? {});
    if (!bound.ok) return errorResponse(`Missing parameters: ${bound.errors.join('; ')}`, 422);

    const result = executeQuery(bound.query, datasets, { role: viewerRole });
    if (!result.ok) return errorResponse(`Query failed: ${result.errors.join('; ')}`, 422);

    const response = successResponse(
      {
        viewer,
        explain,
        stats,
        result: { ...result, warnings: [...adapterWarnings, ...result.warnings] },
      },
      { total: result.rows.length },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
  'Unable to run the query.',
);
