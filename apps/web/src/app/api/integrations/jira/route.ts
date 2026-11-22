import { withRouteErrorHandling, jsonError, readJsonBody } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { createJiraIssuesAdapter } from '@/lib/integrations/jira-issues';
import { JiraCreateIssueSchema } from '@/lib/schemas/integrations/jira';

export const POST = withRouteErrorHandling(
  'POST /api/integrations/jira',
  async (request: Request) => {
    const bodyResult = await readJsonBody(request);
    if ('error' in bodyResult) {
      return bodyResult.error;
    }

    const validation = JiraCreateIssueSchema.safeParse(bodyResult.body);
    if (!validation.success) {
      return jsonError(validation.error.errors[0].message, 400);
    }
    const payload = validation.data;

    const adapter = createJiraIssuesAdapter();
    const issue = await adapter.createIssue(payload);

    if (!issue) {
      return jsonError('Jira issue could not be created', 503);
    }

    return successResponse({ issue });
  },
  'Failed to create Jira issue',
);
