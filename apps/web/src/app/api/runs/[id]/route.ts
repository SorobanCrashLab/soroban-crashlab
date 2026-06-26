import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import type { FuzzingRun } from '@/app/types';
import { withRouteErrorHandling } from '@/lib/route-handler';

/**
 * Resolves a single run by ID from the in-process mock store.
 * Exported for unit testing without the Next.js request layer.
 */
export function findRunById(id: string): FuzzingRun | undefined {
  return buildMockRuns().find((r) => r.id === id);
}

/**
 * GET /api/runs/[id]
 *
 * When RUNS_API_URL is set the request is forwarded to the Rust backend at
 * `${RUNS_API_URL}/runs/<id>`.  Otherwise the response is served from the
 * in-process mock dataset so the frontend stays functional without the backend.
 *
 * Env vars:
 *   RUNS_API_URL  – base URL of the Rust fuzzer API (e.g. http://localhost:8080)
 */
export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Run ID is required' }, { status: 400 });
    }

    const runsApiUrl = process.env.RUNS_API_URL;

    if (runsApiUrl) {
      const upstream = await fetch(
        `${runsApiUrl}/runs/${encodeURIComponent(id)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (upstream.status === 404) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }
      if (!upstream.ok) {
        return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
      }
      const data = (await upstream.json()) as unknown;
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    }

    const run = findRunById(id);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json(run, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  },
);
