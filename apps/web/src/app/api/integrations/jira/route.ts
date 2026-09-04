import { withRouteErrorHandling, jsonError, readJsonBody } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { createJiraIssuesAdapter } from '@/lib/integrations/jira-issues';

export const POST = withRouteErrorHandling(
  'POST /api/integrations/jira',
  async (request: Request) => {
    const bodyResult = await readJsonBody(request);
    if ('error' in bodyResult) {
      return bodyResult.error;
    }

    const payload = bodyResult.body as {
      summary?: unknown;
      description?: unknown;
      projectKey?: unknown;
      issueType?: unknown;
    } | null;

    if (!payload || typeof payload.summary !== 'string' || payload.summary.trim() === '') {
      return jsonError('A non-empty summary is required', 400);
    }

    const adapter = createJiraIssuesAdapter();
    const issue = await adapter.createIssue({
      summary: payload.summary.trim(),
      description: typeof payload.description === 'string' ? payload.description : undefined,
      projectKey: typeof payload.projectKey === 'string' ? payload.projectKey : undefined,
      issueType: typeof payload.issueType === 'string' ? payload.issueType : undefined,
    });

    if (!issue) {
      return jsonError('Jira issue could not be created', 503);
    }

    return successResponse({ issue });
  },
  'Failed to create Jira issue',
);
