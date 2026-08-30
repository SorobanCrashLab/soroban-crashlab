import { NextRequest, NextResponse } from 'next/server';
import type { FuzzingRun } from '@/app/types';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { API_FETCH_TIMEOUT_MS } from '@/lib/timeouts';
import { selectRunStorageDriver } from '@/lib/storage';
import { codedErrorResponse } from '@/lib/error-codes';

export async function findRunById(id: string): Promise<FuzzingRun | undefined> {
  return (await selectRunStorageDriver().getRun(id)) ?? undefined;
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return codedErrorResponse('RUN_ID_REQUIRED');
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
        return codedErrorResponse('RUN_NOT_FOUND');
      }
      if (!upstream.ok) {
        return codedErrorResponse('RUN_UPSTREAM_ERROR');
      }
      const data = (await upstream.json()) as unknown;
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    }

    const run = await findRunById(id);
    if (!run) {
      return codedErrorResponse('RUN_NOT_FOUND');
    }
    return withFixtureCaching(request, run);
  },
);
