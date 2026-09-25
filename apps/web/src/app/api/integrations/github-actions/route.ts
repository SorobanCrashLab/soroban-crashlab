import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { createGithubActionsAdapter } from '@/lib/integrations/github-actions';
import { jsonError, createRouteHandler } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';
import { z } from 'zod';
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function getRepositoryParts(repository: string | null): [string, string] | null {
  if (!repository || !repositoryPattern.test(repository)) return null;
  const [owner, repo] = repository.split('/');
  return owner && repo ? [owner, repo] : null;
}

function getGithubToken(): string | null {
  return process.env.GITHUB_ACTIONS_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
}

function tokenUnavailableResponse() {
  return jsonError(
    'GitHub Actions is not configured. Set GITHUB_ACTIONS_TOKEN with Actions read/write access.',
    503,
  );
}

export const GET = createRouteHandler(
  {
    label: 'GET /api/integrations/github-actions',
    fallbackMessage: 'Unable to load GitHub Actions workflow runs.',
  },
  async (request: Request) => {
    // Note: createRouteHandler passes a standard Request, we can typecast to NextRequest if needed
    const nextReq = request as NextRequest;
    const sanitized = sanitizeSearchParams(nextReq.nextUrl.searchParams);
    const repository = getRepositoryParts(sanitized.get('repository'));
    if (!repository) return jsonError('repository must be in the form owner/repository.', 400);

    const token = getGithubToken();
    if (!token) return tokenUnavailableResponse();

    const [owner, repo] = repository;
    const adapter = createGithubActionsAdapter();
    const workflowRuns = await adapter.listWorkflowRuns(owner, repo, token);
    return successResponse({ workflowRuns });
  }
);

const githubActionsPostSchema = z.object({
  repository: z.string().optional(),
  runId: z.number().int().positive().optional()
});

export const POST = createRouteHandler(
  {
    label: 'POST /api/integrations/github-actions',
    fallbackMessage: 'Unable to queue the GitHub Actions re-run.',
    bodySchema: githubActionsPostSchema
  },
  async (request, { body }) => {
    const { repository, runId } = body;
    const repositoryParts = getRepositoryParts(repository || null);
    if (!repositoryParts) return jsonError('repository must be in the form owner/repository.', 400);
    if (!runId) return jsonError('runId must be a positive integer.', 400);

    const token = getGithubToken();
    if (!token) return tokenUnavailableResponse();

    const [owner, repo] = repositoryParts;
    const adapter = createGithubActionsAdapter();
    await adapter.rerunFailedJobs(owner, repo, runId, token);
    return successResponse({ queued: true, runId });
  }
);
