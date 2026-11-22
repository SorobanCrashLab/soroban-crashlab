import { createAbortSignal } from './adapter-utils';

export interface GithubWorkflowRun {
  id: number;
  name: string;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headBranch: string;
  updatedAt: string;
}

interface GithubWorkflowRunResponse {
  workflow_runs: Array<{
    id: number;
    name: string;
    display_title: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_branch: string;
    updated_at: string;
  }>;
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function githubErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }

  return `GitHub Actions request failed with status ${status}.`;
}

export interface GithubActionsAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createGithubActionsAdapter(options: GithubActionsAdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    /** Fetches the latest workflow runs for a repository without exposing its token to the browser. */
    async listWorkflowRuns(
      owner: string,
      repo: string,
      token: string,
    ): Promise<GithubWorkflowRun[]> {
      const response = await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=20`,
        { headers: githubHeaders(token), signal, cache: 'no-store' },
      );
      const payload: unknown = await response.json().catch(() => undefined);

      if (!response.ok) {
        throw new Error(githubErrorMessage(response.status, payload));
      }

      const runs = (payload as GithubWorkflowRunResponse).workflow_runs ?? [];
      return runs.map((run) => ({
        id: run.id,
        name: run.name,
        displayTitle: run.display_title,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        headBranch: run.head_branch,
        updatedAt: run.updated_at,
      }));
    },

    /** Requests GitHub to retry only failed jobs from a completed workflow run. */
    async rerunFailedJobs(
      owner: string,
      repo: string,
      runId: number,
      token: string,
    ): Promise<void> {
      const response = await fetchImpl(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/rerun-failed-jobs`,
        { method: 'POST', headers: githubHeaders(token), signal, cache: 'no-store' },
      );

      if (response.ok) return;

      const payload: unknown = await response.json().catch(() => undefined);
      throw new Error(githubErrorMessage(response.status, payload));
    },
  };
}
