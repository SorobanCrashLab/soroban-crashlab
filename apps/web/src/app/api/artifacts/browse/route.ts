import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { CursorMismatch, browseArtifacts, parseBrowseQuery } from '@/features/artifacts/storage-manager/lib/query';
import {
  authorizeArtifactRequest,
  backendStatuses,
  getArtifactStore,
  noStore,
  projectCatalog,
} from '@/features/artifacts/storage-manager/lib/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artifacts/browse (#2342)
 *
 * Server-side search, facets and cursor pagination over every configured
 * backend, projected through the caller's role (restricted metadata masked
 * for analysts, hidden from anonymous viewers). Backend health is included
 * so degraded storage is visible next to the results.
 */
export const GET = withRouteErrorHandling(
  'GET /api/artifacts/browse',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const parsed = parseBrowseQuery(request.nextUrl.searchParams);
    if (!parsed.ok) return errorResponse(`Invalid browse query: ${parsed.errors.join('; ')}`, 422);

    const catalog = await getArtifactStore().catalog();
    const visible = projectCatalog(catalog, authorization.viewer.role);
    let result;
    try {
      result = browseArtifacts(visible, parsed.query);
    } catch (error) {
      if (error instanceof CursorMismatch) return errorResponse(error.message, 400);
      throw error;
    }
    return noStore(
      successResponse(
        {
          viewer: authorization.viewer,
          backends: backendStatuses(visible),
          query: { ...parsed.query, cursor: undefined },
          ...result,
        },
        { total: result.total },
      ),
    );
  },
  'Unable to browse artifacts.',
);
