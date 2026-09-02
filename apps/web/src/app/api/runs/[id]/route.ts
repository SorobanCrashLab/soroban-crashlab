import { NextRequest, NextResponse } from 'next/server';
import type { FuzzingRun } from '@/app/types';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { errorResponse, status } from '@/lib/api-response-utils';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { selectRunStorageDriver } from '@/lib/storage';

export async function findRunById(id: string): Promise<FuzzingRun | undefined> {
  return (await selectRunStorageDriver().getRun(id)) ?? undefined;
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return errorResponse('Run ID is required', status.badRequest);
    }

    const runsApiUrl = process.env.RUNS_API_URL;

    if (runsApiUrl) {
      const upstream = await fetch(
        `${runsApiUrl}/runs/${encodeURIComponent(id)}`,
{
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
        },
      );
      if (upstream.status === 404) {
        return errorResponse('Run not found', status.notFound);
      }
      if (!upstream.ok) {
        return errorResponse('Upstream error', status.badGateway);
      }
      const data = (await upstream.json()) as unknown;
      return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    }

    const run = await findRunById(id);
    if (!run) {
      return errorResponse('Run not found', status.notFound);
    }
    return withFixtureCaching(request, { data: run });
  },
);
