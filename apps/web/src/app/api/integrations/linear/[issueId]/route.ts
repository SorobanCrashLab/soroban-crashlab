/**
 * GET /api/integrations/linear/:issueId
 *
 * Fetches Linear issue metadata for the specified issue ID.
 * Returns 404 if the issue is not found or API key is not configured.
 */

import { successResponse } from '@/lib/api-response-utils';
import { createRouteHandler, jsonError } from '@/lib/route-handler';
import { createLinearIssuesAdapter } from '@/lib/integrations/linear-issues';

export const GET = createRouteHandler(
  {
    label: 'GET /api/integrations/linear/[issueId]',
    fallbackMessage: 'Failed to fetch Linear issue',
  },
  async (_request, { params }) => {
    const { issueId } = await params as { issueId: string };

    if (!issueId || issueId.trim() === '') {
      return jsonError('Issue ID is required', 400);
    }

    const adapter = createLinearIssuesAdapter();
    const issue = await adapter.fetchIssue(issueId);

    if (!issue) {
      return jsonError('Issue not found or Linear not configured', 404);
    }

    return successResponse({ issue });
  }
);

