import { NextRequest, NextResponse } from 'next/server';
import { buildMockRuns } from '../../../mockRuns';
import { ComparisonTooLargeError, compareSides } from '@/lib/comparison/delta';
import { toComparisonSide } from '@/lib/comparison/from-run';
import { matchesComparisonFilter, decodeComparisonSearch } from '@/lib/comparison/url-state';
import { errorResponse, status, successResponse } from '@/lib/api-response-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/runs/compare?base=<id>&candidate=<id>
 *
 * The comparison view's data source (#1877). The pair is validated before any
 * run is loaded, so a malformed or self-comparing link is a 400 with a reason
 * rather than an empty diff. An oversized comparison is a 422 carrying the
 * same narrowing guidance the model raised — the UI renders it inline.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const decoded = decodeComparisonSearch({
    base: params.get('base') ?? undefined,
    candidate: params.get('candidate') ?? undefined,
    failureClass: params.get('failureClass') ?? undefined,
    contract: params.get('contract') ?? undefined,
  });

  if (!decoded.ok) {
    return errorResponse(decoded.message, status.badRequest);
  }

  const { state } = decoded;
  const runs = buildMockRuns();
  const baseRun = runs.find((run) => run.id === state.base);
  const candidateRun = runs.find((run) => run.id === state.candidate);

  if (!baseRun) {
    return errorResponse(`Run ${state.base} was not found.`, status.notFound);
  }
  if (!candidateRun) {
    return errorResponse(`Run ${state.candidate} was not found.`, status.notFound);
  }

  const filters = {
    ...(state.failureClass !== undefined ? { failureClass: state.failureClass } : {}),
    ...(state.contract !== undefined ? { contract: state.contract } : {}),
  };

  try {
    const base = toComparisonSide(baseRun);
    const candidate = toComparisonSide(candidateRun);

    // Filters hide rows on both sides symmetrically, so the delta still pairs
    // like with like rather than comparing a filtered run to an unfiltered one.
    const filteredBase = {
      ...base,
      signatures: base.signatures.filter((sample) => matchesComparisonFilter(sample, filters)),
    };
    const filteredCandidate = {
      ...candidate,
      signatures: candidate.signatures.filter((sample) => matchesComparisonFilter(sample, filters)),
    };

    const result = compareSides(filteredBase, filteredCandidate);
    const query = params.toString();

    return successResponse({
      base: {
        runId: result.base.runId,
        label: result.base.label,
        signatureCount: result.base.signatures.length,
        metrics: result.base.metrics,
      },
      candidate: {
        runId: result.candidate.runId,
        label: result.candidate.label,
        signatureCount: result.candidate.signatures.length,
        metrics: result.candidate.metrics,
      },
      filters,
      delta: result.delta,
      links: {
        self: `/api/runs/compare?${query}`,
        swap: `/compare?base=${encodeURIComponent(state.candidate)}&candidate=${encodeURIComponent(state.base)}`,
        page: `/compare?${query}`,
      },
    });
  } catch (error) {
    if (error instanceof ComparisonTooLargeError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'COMPARISON_TOO_LARGE',
          guidance: error.guidance,
          signatureCount: error.signatureCount,
          limit: error.limit,
        },
        { status: status.unprocessableEntity },
      );
    }
    throw error;
  }
}
