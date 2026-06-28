import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import type { FuzzingRun } from '@/app/types';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { errorResponse, status } from '@/lib/api-response-utils';

export function findRunById(id: string): FuzzingRun | undefined {
  return buildMockRuns().find((r) => r.id === id);
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return errorResponse('Run ID is required', status.badRequest);
    }

    const runsApiUrl = process.env.RUNS_API_URL;

    if (runsApiUrl) {
      const upstream = await fetch(
        `${runsApiUrl}/runs/${encodeURIComponent(id)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (upstream.status === 404) {
        return errorResponse('Run not found', status.notFound);
      }
      if (!upstream.ok) {
        return errorResponse('Upstream error', status.badGateway);
      }
      const data = (await upstream.json()) as unknown;
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    }

    const run = findRunById(id);
    if (!run) {
      return errorResponse('Run not found', status.notFound);
    }
    return NextResponse.json(run, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  },
);
