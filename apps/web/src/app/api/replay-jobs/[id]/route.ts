import { NextRequest } from 'next/server';
import { errorResponse, status, successResponse } from '@/lib/api-response-utils';
import { replayJobStore } from '@/lib/replay/job-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/replay-jobs/[id]
 *
 * Returns a replay job with its event log and (once finished) its failure or
 * result. The result page and the polling fallback for the SSE stream both use
 * this endpoint.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return errorResponse('Replay job ID is required', status.badRequest);
  }

  const job = replayJobStore.get(id);
  if (!job) {
    return errorResponse('Replay job not found', status.notFound);
  }

  return successResponse({ job });
}
