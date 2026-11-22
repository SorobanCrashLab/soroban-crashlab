import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, errorResponse, status } from '@/lib/api-response-utils';
import { getMockReplayHistoryForRun } from '@/fixtures/replay-history';
import { sortReplayHistoryByTimestamp } from '@/app/run-replay-history-utils';
import { withFixtureCaching } from '@/lib/fixture-caching';

export const runtime = 'nodejs';

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/replay-history',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return errorResponse('Run ID is required', status.badRequest);
    }

    const runsApiUrl = process.env.RUNS_API_URL;

    if (runsApiUrl) {
      const upstream = await fetch(
        `${runsApiUrl}/runs/${encodeURIComponent(id)}/replay-history`,
        {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (upstream.status === 404) {
        return errorResponse('Run not found', status.notFound);
      }

      if (!upstream.ok) {
        return errorResponse('Upstream error', status.badGateway);
      }

      const data = (await upstream.json()) as unknown;
      return successResponse(data);
    }

    const entries = sortReplayHistoryByTimestamp(getMockReplayHistoryForRun(id), 'desc');
    const data = { entries };
    return withFixtureCaching(request, data);
  },
);
