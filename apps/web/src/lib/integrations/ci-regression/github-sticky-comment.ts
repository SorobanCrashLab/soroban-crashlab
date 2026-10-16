/**
 * GitHub REST calls for the regression summary (#1891): one sticky PR comment
 * edited in place on every run, plus a check run carrying the concise output.
 *
 * Request conventions (headers, API version) follow
 * `lib/integrations/github-actions.ts`. `fetchImpl` is injectable so the tests
 * drive the upsert against a stubbed API.
 */

export const GITHUB_API_URL = 'https://api.github.com';
const PER_PAGE = 100;
/** Stop scanning after this many pages; a PR with 1000+ comments gets a new one. */
const MAX_COMMENT_PAGES = 10;

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

export interface GithubRestClient {
  request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T>;
}

export interface GithubRestClientOptions {
  token: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export function createGithubRestClient(options: GithubRestClientOptions): GithubRestClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (options.apiUrl ?? GITHUB_API_URL).replace(/\/+$/, '');

  return {
    async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
      const response = await fetchImpl(`${apiUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${options.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }

      if (!response.ok) {
        const message =
          parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
            ? parsed.message
            : `GitHub request failed with status ${response.status}.`;
        throw new GithubApiError(response.status, `${method} ${path}: ${message}`);
      }
      return parsed as T;
    },
  };
}

export function splitRepository(repository: string): { owner: string; repo: string } {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  // Dot-only segments would be normalised out of the request path.
  if (!match || /^\.+$/.test(match[1]) || /^\.+$/.test(match[2])) {
    throw new Error(`Invalid repository "${repository}"; expected owner/repo.`);
  }
  return { owner: match[1], repo: match[2] };
}

function repoPath(repository: string): string {
  const { owner, repo } = splitRepository(repository);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

interface IssueComment {
  id: number;
  body?: string | null;
}

export type StickyCommentAction = 'created' | 'updated' | 'unchanged';

export interface StickyCommentInput {
  repository: string;
  issueNumber: number;
  /** Must start with `marker`. */
  body: string;
  marker: string;
}

/**
 * Creates the PR's sticky comment, or edits the existing one in place.
 *
 * A comment is ours only when its body *starts* with the marker, so a human
 * quoting the summary (which prefixes `> `) is never overwritten. If several
 * match (e.g. two runs raced on the first post), the oldest is kept current.
 */
export async function upsertStickyComment(
  client: GithubRestClient,
  input: StickyCommentInput,
): Promise<{ action: StickyCommentAction; commentId: number }> {
  if (!input.body.startsWith(input.marker)) {
    throw new Error('Sticky comment body must start with its marker.');
  }
  const base = `${repoPath(input.repository)}/issues`;

  let existing: IssueComment | undefined;
  for (let page = 1; page <= MAX_COMMENT_PAGES && !existing; page++) {
    const comments = await client.request<IssueComment[]>(
      'GET',
      `${base}/${input.issueNumber}/comments?per_page=${PER_PAGE}&page=${page}`,
    );
    existing = comments.find((c) => typeof c.body === 'string' && c.body.startsWith(input.marker));
    if (comments.length < PER_PAGE) break;
  }

  if (existing) {
    if (existing.body === input.body) return { action: 'unchanged', commentId: existing.id };
    const updated = await client.request<IssueComment>('PATCH', `${base}/comments/${existing.id}`, {
      body: input.body,
    });
    return { action: 'updated', commentId: updated.id };
  }

  const created = await client.request<IssueComment>('POST', `${base}/${input.issueNumber}/comments`, {
    body: input.body,
  });
  return { action: 'created', commentId: created.id };
}

export interface CheckRunInput {
  repository: string;
  headSha: string;
  name: string;
  conclusion: 'success' | 'failure' | 'neutral';
  title: string;
  summary: string;
  detailsUrl?: string | null;
}

/** Posts a completed check run whose output heads the Checks tab. */
export async function createCheckRun(client: GithubRestClient, input: CheckRunInput): Promise<number> {
  const created = await client.request<{ id: number }>('POST', `${repoPath(input.repository)}/check-runs`, {
    name: input.name,
    head_sha: input.headSha,
    status: 'completed',
    conclusion: input.conclusion,
    ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
    output: { title: input.title, summary: input.summary },
  });
  return created.id;
}
