import { z } from 'zod';

export const JiraCreateIssueSchema = z.object({
  summary: z.string().trim().min(1, 'A non-empty summary is required'),
  description: z.string().optional(),
  projectKey: z.string().optional(),
  issueType: z.string().optional(),
});
