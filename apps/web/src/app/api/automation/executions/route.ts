import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';
import { resolvePrincipal } from '@/lib/rbac';
import { automationStore, MAX_AUTOMATION_EXECUTIONS } from '@/lib/automation/store';

export const dynamic = 'force-dynamic';

export const GET = withRouteErrorHandling(
  'GET /api/automation/executions',
  async (request: NextRequest) => {
    const principal = await resolvePrincipal(request);
    const rawLimit = request.nextUrl.searchParams.get('limit');
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return errorResponse('The limit parameter must be an integer between 1 and 100.', 400);
    }
    const ruleId = request.nextUrl.searchParams.get('ruleId');
    const allExecutions = await automationStore.listExecutions(principal.subject, MAX_AUTOMATION_EXECUTIONS);
    const executions = ruleId
      ? allExecutions.filter((entry) => entry.ruleId === ruleId).slice(0, limit)
      : allExecutions.slice(0, limit);
    return successResponse({ executions });
  },
);
