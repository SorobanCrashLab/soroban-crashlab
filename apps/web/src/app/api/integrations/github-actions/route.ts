import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api-response-utils';
import { createGithubActionsAdapter } from '@/lib/integrations/github-actions';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchParams } from '@/lib/sanitize';

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

export const GET = withRouteErrorHandling(
  'GET /api/integrations/github-actions',
  async (request: NextRequest) => {
    const sanitized = sanitizeSearchParams(request.nextUrl.searchParams);
    const repository = getRepositoryParts(sanitized.get('repository'));
    if (!repository) return jsonError('repository must be in the form owner/repository.', 400);

    const token = getGithubToken();
    if (!token) return tokenUnavailableResponse();

    const [owner, repo] = repository;
    const adapter = createGithubActionsAdapter();
    const workflowRuns = await adapter.listWorkflowRuns(owner, repo, token);
    return successResponse({ workflowRuns });
  },
  'Unable to load GitHub Actions workflow runs.',
);

export const POST = withRouteErrorHandling(
  'POST /api/integrations/github-actions',
  async (request: NextRequest) => {
    const parsed = await readJsonBody(request);
    if ('error' in parsed) return parsed.error;

    const body = parsed.body;
    if (!body || typeof body !== 'object') return jsonError('Request body must be an object.', 400);

    const { repository, runId } = body as { repository?: unknown; runId?: unknown };
    const repositoryParts = getRepositoryParts(typeof repository === 'string' ? repository : null);
    if (!repositoryParts) return jsonError('repository must be in the form owner/repository.', 400);
    if (!Number.isSafeInteger(runId) || (runId as number) <= 0) {
      return jsonError('runId must be a positive integer.', 400);
    }

    const token = getGithubToken();
    if (!token) return tokenUnavailableResponse();

    const [owner, repo] = repositoryParts;
    const adapter = createGithubActionsAdapter();
    await adapter.rerunFailedJobs(owner, repo, runId as number, token);
    return successResponse({ queued: true, runId });
  },
  'Unable to queue the GitHub Actions re-run.',
);
