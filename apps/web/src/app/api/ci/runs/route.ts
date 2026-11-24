import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import type { CiRunsPayload } from '@/features/ci/lib/api';
import { filterSnapshotForPermissions } from '@/features/ci/lib/permissions';
import { parseCiQuery, filterRunsForQuery } from '@/features/ci/lib/query';
import { authorizeCiRequest, ciSuccess, getCiProvider } from '@/features/ci/lib/server';
import { selectLatestRuns } from '@/features/ci/lib/status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ci/runs
 *
 * Returns the latest attempt of each matching run plus the rerun history for
 * those runs. The provider is selected on the server; all payloads are
 * projected through the caller's role before any derived data is computed.
 */
export const GET = withRouteErrorHandling(
  'GET /api/ci/runs',
  async (request: NextRequest) => {
    const authorization = await authorizeCiRequest(request);
    if (!authorization.ok) return authorization.response;

    const parsed = parseCiQuery(request.nextUrl.searchParams);
    if (!parsed.ok) {
      return errorResponse(`Invalid CI query: ${parsed.errors.join('; ')}`, 422);
    }

    const snapshot = await getCiProvider().getSnapshot(parsed.query);
    const visible = filterSnapshotForPermissions(snapshot, authorization.context.permissions);
    const { history } = selectLatestRuns(visible.runs);
    const runs = filterRunsForQuery(visible.runs, parsed.query);
    const visibleIds = new Set(runs.map((run) => run.id));
    const relevantHistory = Object.fromEntries(
      Object.entries(history).filter(([winnerId]) => visibleIds.has(winnerId)),
    );

    const payload: CiRunsPayload = {
      repository: visible.repository,
      source: visible.source,
      generatedAt: visible.generatedAt,
      policy: visible.policy,
      query: parsed.query,
      role: authorization.context.role,
      subject: authorization.context.subject,
      permissions: authorization.context.permissions,
      runs,
      history: relevantHistory,
      regressions: visible.regressions,
      incidents: visible.incidents,
      changes: visible.changes,
    };
    return ciSuccess(request, payload, runs.length);
  },
  'Unable to load CI runs.',
);
