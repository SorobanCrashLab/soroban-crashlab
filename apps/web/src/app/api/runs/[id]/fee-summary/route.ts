import { withRouteErrorHandling } from '@/lib/route-handler';
import { withFixtureCaching } from '@/lib/fixture-caching';
import { selectRunStorageDriver } from '@/lib/storage';
import { codedErrorResponse } from '@/lib/error-codes';
import { queryBudget, QUERY_BUDGETS } from '@/lib/database/query-budget';
import { buildRunFeeSummary } from '@/app/resource-fee-insight-utils';

/**
 * GET /api/runs/[id]/fee-summary
 *
 * Per-run fee summary used by the run-detail chip and by fee API consumers.
 * Feature-detects the W5-A12 envelope and falls back to flat resource metrics
 * for older runs (`source: "legacy"`); a run with none of those fields returns
 * `source: "absent"` and `hasFeeData: false` so the UI can explain the gap.
 */
export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/fee-summary',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return codedErrorResponse('RUN_ID_REQUIRED');
    }

    const budgetKey = `run-fee-summary:${id}`;
    queryBudget.setBudget(budgetKey, QUERY_BUDGETS.RUN_DETAIL);
    queryBudget.recordQuery(budgetKey);

    const run = await selectRunStorageDriver().getRun(id);
    if (!run) {
      return codedErrorResponse('RUN_NOT_FOUND');
    }

    return withFixtureCaching(request, { data: buildRunFeeSummary(run) });
  },
);
