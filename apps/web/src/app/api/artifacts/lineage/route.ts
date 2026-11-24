import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { assessIntegrity } from '@/features/artifacts/storage-manager/lib/integrity';
import { buildLineage } from '@/features/artifacts/storage-manager/lib/lineage';
import {
  authorizeArtifactRequest,
  getArtifactStore,
  noStore,
  projectCatalog,
} from '@/features/artifacts/storage-manager/lib/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artifacts/lineage?id=&depth= (#2342)
 *
 * Ancestors, descendants and owning run/campaign/crash/report of an
 * artifact, computed over the caller's projected catalog so a hidden
 * artifact never appears as a node.
 */
export const GET = withRouteErrorHandling(
  'GET /api/artifacts/lineage',
  async (request: NextRequest) => {
    const authorization = await authorizeArtifactRequest(request);
    if (!authorization.ok) return authorization.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return errorResponse('id is required', 400);
    const depthParam = Number(request.nextUrl.searchParams.get('depth') ?? '2');
    const depth = Number.isInteger(depthParam) ? Math.min(4, Math.max(1, depthParam)) : 2;

    const visible = projectCatalog(await getArtifactStore().catalog(), authorization.viewer.role);
    const graph = buildLineage(visible, id, depth, (artifact) => assessIntegrity(artifact).level);
    if (!graph) return errorResponse('Artifact not found', 404);
    return noStore(successResponse({ viewer: authorization.viewer, depth, graph }, { total: graph.nodes.length }));
  },
  'Unable to build artifact lineage.',
);
