import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import {
  MAX_TIMELINE_BUCKETS,
  DEFAULT_TIMELINE_BUCKETS,
} from '@/lib/campaigns/campaign-timeline';
import { buildCampaignTimelineFor } from '@/lib/campaigns/campaign-registry';

export const dynamic = 'force-dynamic';

function parseIsoQuery(value: string | null): { ok: true; ms: number | null } | { ok: false } {
  if (value === null || value.trim() === '') return { ok: true, ms: null };
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? { ok: true, ms: parsed } : { ok: false };
}

function parseBucketsQuery(
  value: string | null,
): { ok: true; buckets: number } | { ok: false } {
  if (value === null || value.trim() === '') {
    return { ok: true, buckets: DEFAULT_TIMELINE_BUCKETS };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return { ok: false };
  // Over-large requests are clamped by the series builder; advertise the cap.
  return { ok: true, buckets: Math.min(parsed, MAX_TIMELINE_BUCKETS) };
}

/**
 * GET /api/campaigns/[id]/timeline
 *
 * Time-series view of one campaign (#1874):
 *  - `buckets` (1..500, default 240) bounds the response; the server folds
 *    every raw sample into those buckets, so long runs never ship raw points.
 *  - `from` / `to` (ISO-8601) narrow the range; the response keeps the
 *    buckets aligned to the requested window, which the scrubber uses when a
 *    failure bar is clicked.
 *
 * The payload also carries milestone markers and the failure points used for
 * click-through, each sorted by time and filtered to the range.
 */
export const GET = withRouteErrorHandling(
  'GET /api/campaigns/[id]/timeline',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (typeof id !== 'string' || id.length === 0) {
      return errorResponse('Campaign id is required.', 400);
    }

    const search = request.nextUrl.searchParams;
    const from = parseIsoQuery(search.get('from'));
    if (!from.ok) {
      return errorResponse('"from" must be an ISO-8601 timestamp.', 400);
    }
    const to = parseIsoQuery(search.get('to'));
    if (!to.ok) {
      return errorResponse('"to" must be an ISO-8601 timestamp.', 400);
    }
    if (from.ms !== null && to.ms !== null && from.ms > to.ms) {
      return errorResponse('"from" must not be after "to".', 400);
    }

    const buckets = parseBucketsQuery(search.get('buckets'));
    if (!buckets.ok) {
      return errorResponse('"buckets" must be a positive integer.', 400);
    }

    const series = buildCampaignTimelineFor(id, {
      buckets: buckets.buckets,
      ...(from.ms !== null || to.ms !== null
        ? {
            range: {
              ...(from.ms !== null ? { start: new Date(from.ms).toISOString() } : {}),
              ...(to.ms !== null ? { end: new Date(to.ms).toISOString() } : {}),
            },
          }
        : {}),
    });
    if (series === null) {
      return errorResponse('Campaign not found.', 404);
    }

    const response: NextResponse = successResponse(series);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Timeline-Buckets', String(series.bucketCount));
    response.headers.set(
      'X-Timeline-Downsampled',
      series.downsampled ? 'true' : 'false',
    );
    return response;
  },
  'Failed to load campaign timeline.',
);
