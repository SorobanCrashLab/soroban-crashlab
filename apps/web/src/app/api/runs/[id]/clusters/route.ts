import { NextRequest } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import { tryBackend } from '@/lib/api-proxy';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, errorResponse, status } from '@/lib/api-response-utils';
import {
  buildHierarchicalClustersFromRuns,
  findClusterForRun,
  normalizeSignaturePreimage,
  defaultNormalizationRules,
} from '@/lib/failure-clustering';

export const runtime = 'nodejs';

const RUNS_API_URL = process.env.RUNS_API_URL || process.env.NEXT_PUBLIC_API_URL;

/**
 * GET /api/runs/[id]/clusters
 *
 * Returns the hierarchical failure clusters for the campaign the run belongs
 * to, highlighting the cluster that contains `id` and exposing each cluster's
 * exemplar link plus its members for drill-down (W5-H02).
 *
 * Success envelope (W5-E09): `{ data: { runId, cluster, clusters }, total }`.
 */
export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/clusters',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return errorResponse('Run ID is required', status.badRequest);
    }

    return tryBackend(RUNS_API_URL, `/runs/${encodeURIComponent(id)}/clusters`, {}, () => {
      const runs = buildMockRuns();
      const run = runs.find((r) => r.id === id);
      if (!run) {
        return jsonError('Run not found', 404);
      }

      const rules = defaultNormalizationRules();
      const clusters = buildHierarchicalClustersFromRuns(runs, rules);
      const cluster = findClusterForRun(runs, id, rules);

      return successResponse(
        {
          runId: id,
          cluster,
          clusters,
          rules: {
            rulesVersion: rules.rulesVersion,
            taxonomyVersion: rules.taxonomyVersion,
            sampleNormalization: run.crashDetail
              ? normalizeSignaturePreimage(run.crashDetail.signature, rules).text
              : null,
          },
        },
        { total: clusters.length },
      );
    });
  },
);
