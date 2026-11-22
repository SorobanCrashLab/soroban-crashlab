/**
 * GitHub issue link resolution.
 *
 * Parses a GitHub issue/PR URL and resolves its title and state through
 * GitHub's public REST API. Resolution is best-effort: private repos, deleted
 * issues, rate limits and network errors all fall back to a placeholder title
 * with `resolved: false` rather than throwing.
 */

export interface GithubIssueUrl {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface ResolvedGithubIssue {
  url: string;
  title: string;
  state?: 'open' | 'closed';
  resolved: boolean;
}

export interface GithubIssuesAdapter {
  resolveIssueLink(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<ResolvedGithubIssue>;
  resolveIssueLinkFromUrl(url: string): Promise<ResolvedGithubIssue | null>;
}

export interface GithubIssuesAdapterOptions {
  fetchImpl?: typeof fetch;
}

const ISSUE_URL_PATTERN =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/([1-9]\d*)\/?$/i;

/** Parses `https://github.com/<owner>/<repo>/(issues|pull)/<n>`; null otherwise. */
export function parseGithubIssueUrl(raw: string): GithubIssueUrl | null {
  const match = ISSUE_URL_PATTERN.exec(raw.trim());
  if (!match) return null;

  const issueNumber = Number(match[3]);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return null;

  return { owner: match[1], repo: match[2], issueNumber };
}

export function createGithubIssuesAdapter(
  options: GithubIssuesAdapterOptions = {},
): GithubIssuesAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function resolveIssueLink(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<ResolvedGithubIssue> {
    const url = `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'soroban-crashlab',
          },
        },
      );

      if (!response.ok) {
        return { url, title: `#${issueNumber}`, resolved: false };
      }

      const body: unknown = await response.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as { title?: unknown }).title !== 'string' ||
        ((body as { state?: unknown }).state !== 'open' &&
          (body as { state?: unknown }).state !== 'closed')
      ) {
        return { url, title: `#${issueNumber}`, resolved: false };
      }

      const { title, state } = body as { title: string; state: 'open' | 'closed' };
      return { url, title, state, resolved: true };
    } catch {
      return { url, title: `#${issueNumber}`, resolved: false };
    }
  }

  return {
    resolveIssueLink,
    async resolveIssueLinkFromUrl(url: string): Promise<ResolvedGithubIssue | null> {
      const parsed = parseGithubIssueUrl(url);
      if (!parsed) return null;
      return resolveIssueLink(parsed.owner, parsed.repo, parsed.issueNumber);
    },
  };
}
