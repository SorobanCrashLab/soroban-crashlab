/**
 * GET /api/integrations/linear/:issueId
 *
 * Fetches Linear issue metadata for the specified issue ID.
 * Returns 404 if the issue is not found or API key is not configured.
 */

import { successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling, jsonError } from '@/lib/route-handler';
import { createLinearIssuesAdapter } from '@/lib/integrations/linear-issues';

interface RouteContext {
  params: Promise<{ issueId: string }>;
}

export const GET = withRouteErrorHandling(
  'GET /api/integrations/linear/[issueId]',
  async (_request: Request, context: RouteContext) => {
    const { issueId } = await context.params;

    if (!issueId || issueId.trim() === '') {
      return jsonError('Issue ID is required', 400);
    }

    const adapter = createLinearIssuesAdapter();
    const issue = await adapter.fetchIssue(issueId);

    if (!issue) {
      return jsonError('Issue not found or Linear not configured', 404);
    }

    return successResponse({ issue });
  },
  'Failed to fetch Linear issue',
);
