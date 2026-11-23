import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import type { CiGatesPayload } from '@/features/ci/lib/api';
import { correlateFailures } from '@/features/ci/lib/correlation';
import { flakeLeaderboard } from '@/features/ci/lib/flake';
import { evaluateGates, gateObservationsFromRuns } from '@/features/ci/lib/gates';
import { filterSnapshotForPermissions } from '@/features/ci/lib/permissions';
import { parseCiQuery, filterRunsForQuery } from '@/features/ci/lib/query';
import { authorizeCiRequest, ciSuccess, getCiProvider } from '@/features/ci/lib/server';
import { selectLatestRuns } from '@/features/ci/lib/status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ci/gates
 *
 * Evaluates the eight gates for the selected runs and adds flake scores and
 * failure correlations. Rerun history is included because a single latest
 * attempt cannot reveal pass/fail flips; older attempts stay server-side only
 * insofar as they were already visible to the caller.
 */
export const GET = withRouteErrorHandling(
  'GET /api/ci/gates',
  async (request: NextRequest) => {
    const authorization = await authorizeCiRequest(request);
    if (!authorization.ok) return authorization.response;

    const parsed = parseCiQuery(request.nextUrl.searchParams);
    if (!parsed.ok) {
      return errorResponse(`Invalid CI query: ${parsed.errors.join('; ')}`, 422);
    }

    const snapshot = await getCiProvider().getSnapshot(parsed.query);
    const visible = filterSnapshotForPermissions(snapshot, authorization.context.permissions);
    const runs = filterRunsForQuery(visible.runs, parsed.query);
    const { history } = selectLatestRuns(visible.runs);
    const visibleIds = new Set(runs.map((run) => run.id));
    const rerunHistory = Object.entries(history)
      .filter(([winnerId]) => visibleIds.has(winnerId))
      .flatMap(([, attempts]) => attempts);
    const allRuns = [...runs, ...rerunHistory];

    const generatedMs = Date.parse(visible.generatedAt);
    const nowMs = Number.isFinite(generatedMs) ? generatedMs : undefined;
    const observations = gateObservationsFromRuns(runs);
    const evaluation = evaluateGates(observations, visible.policy, visible.generatedAt);
    const flakes = flakeLeaderboard(allRuns, nowMs === undefined ? {} : { nowMs });
    const correlations = correlateFailures(
      allRuns,
      {
        regressions: visible.regressions,
        incidents: visible.incidents,
        changes: visible.changes,
      },
      nowMs,
    );

    const payload: CiGatesPayload = {
      repository: visible.repository,
      source: visible.source,
      generatedAt: visible.generatedAt,
      policy: visible.policy,
      query: parsed.query,
      role: authorization.context.role,
      subject: authorization.context.subject,
      permissions: authorization.context.permissions,
      evaluation,
      flakes,
      correlations,
    };
    return ciSuccess(request, payload, evaluation.cards.length);
  },
  'Unable to evaluate CI quality gates.',
);
