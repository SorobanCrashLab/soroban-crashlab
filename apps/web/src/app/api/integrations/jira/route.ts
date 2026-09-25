import { createRouteHandler, jsonError } from '@/lib/route-handler';
import { successResponse } from '@/lib/api-response-utils';
import { createJiraIssuesAdapter } from '@/lib/integrations/jira-issues';
import { z } from 'zod';

const jiraIssueSchema = z.object({
  summary: z.string().min(1, 'A non-empty summary is required'),
  description: z.string().optional(),
  projectKey: z.string().optional(),
  issueType: z.string().optional(),
});

export const POST = createRouteHandler(
  {
    label: 'POST /api/integrations/jira',
    fallbackMessage: 'Failed to create Jira issue',
    bodySchema: jiraIssueSchema,
  },
  async (request, { body }) => {
    const adapter = createJiraIssuesAdapter();
    const issue = await adapter.createIssue({
      summary: body.summary.trim(),
      description: body.description,
      projectKey: body.projectKey,
      issueType: body.issueType,
    });

    if (!issue) {
      return jsonError('Jira issue could not be created', 503);
    }

    return successResponse({ issue });
  }
);

